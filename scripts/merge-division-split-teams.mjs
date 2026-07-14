// 승강 division 분열 Team row 병합 (dry-run 기본).
// 같은 ts id 가 1부/2부 두 Team row 로 갈린 케이스(Qarabag 선례)를 keeper 로 통합한다.
// 처리 순서(트랜잭션): TeamSourceId 이전 → Match FK 재배정 → Team 삭제. JSON 은 트랜잭션 밖.
//
// 사용:
//   node --env-file=.env.local scripts/merge-division-split-teams.mjs           # dry-run
//   node --env-file=.env.local scripts/merge-division-split-teams.mjs --apply    # 실행

import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const MAP_FILE = "src/lib/sports/thesports/team-id-mapping.json";

// keep = 현재 리그(현역) row, drop = 통합될 row. league 검증으로 안전장치.
const MERGES = [
  { label: "Aarau", keep: { id: 284965, league: "SWISS_SL" }, drop: { id: 285055, league: "CHALLENGE_LEAGUE" } },
  { label: "Banik Ostrava", keep: { id: 285550, league: "CZECH_L" }, drop: { id: 608011, league: "CZECH_2" } },
];

async function main() {
  console.log(`모드: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  const plan = [];
  for (const m of MERGES) {
    const keep = await prisma.team.findUnique({ where: { id: m.keep.id }, select: { id: true, name: true, league: true } });
    const drop = await prisma.team.findUnique({ where: { id: m.drop.id }, select: { id: true, name: true, league: true } });
    if (!keep || !drop) { console.log(`SKIP ${m.label}: row 없음 (keep=${!!keep} drop=${!!drop})`); continue; }
    if (keep.league !== m.keep.league || drop.league !== m.drop.league) {
      throw new Error(`${m.label} 검증 실패: keep.league=${keep.league}(기대 ${m.keep.league}) drop.league=${drop.league}(기대 ${m.drop.league})`);
    }
    const matchCnt = await prisma.match.count({ where: { OR: [{ homeTeamId: drop.id }, { awayTeamId: drop.id }] } });
    const srcs = await prisma.teamSourceId.findMany({ where: { teamId: drop.id }, select: { id: true, source: true, externalId: true, league: true } });
    // 이전 충돌 재확인 (keep 에 같은 league+source+ext 존재?)
    const keepSrcs = await prisma.teamSourceId.findMany({ where: { teamId: keep.id }, select: { source: true, externalId: true, league: true } });
    const keepKeys = new Set(keepSrcs.map((s) => `${s.league}|${s.source}|${s.externalId}`));
    const conflict = srcs.filter((s) => keepKeys.has(`${s.league}|${s.source}|${s.externalId}`));
    if (conflict.length) throw new Error(`${m.label}: TeamSourceId 이전충돌 ${conflict.length} — 수동 처리 필요`);
    console.log(`● ${m.label}: keep #${keep.id}(${keep.league}) ← drop #${drop.id}(${drop.league})`);
    console.log(`   Match FK 재배정 ${matchCnt}건, TeamSourceId 이전 ${srcs.length}건 [${srcs.map((s) => `${s.source}@${s.league}`).join(", ")}]`);
    plan.push({ ...m, keep, drop, matchCnt, srcIds: srcs.map((s) => s.id) });
  }

  // JSON 재배정 대상 (drop.id 가리키는 엔트리 → keep.id, ourLeague 유지)
  const mapJson = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  const jsonFixes = [];
  for (const k in mapJson) {
    const v = mapJson[k];
    const hit = plan.find((p) => v.ourId === p.drop.id);
    if (hit) jsonFixes.push({ key: k, from: v.ourId, to: hit.keep.id, ourLeague: v.ourLeague });
  }
  console.log(`\nteam-id-mapping.json 재배정: ${jsonFixes.length}건`);
  jsonFixes.forEach((f) => console.log(`   [${f.key}] ourId ${f.from}→${f.to} (ourLeague=${f.ourLeague} 유지)`));

  if (!APPLY) {
    console.log(`\n[DRY-RUN] 병합 ${plan.length}건. --apply 로 실행.`);
    await prisma.$disconnect();
    return;
  }

  for (const p of plan) {
    await prisma.$transaction(async (tx) => {
      await tx.teamSourceId.updateMany({ where: { teamId: p.drop.id }, data: { teamId: p.keep.id } });
      await tx.match.updateMany({ where: { homeTeamId: p.drop.id }, data: { homeTeamId: p.keep.id } });
      await tx.match.updateMany({ where: { awayTeamId: p.drop.id }, data: { awayTeamId: p.keep.id } });
      await tx.team.delete({ where: { id: p.drop.id } });
    });
    console.log(`[APPLY] ${p.label} 병합 완료 (#${p.drop.id} → #${p.keep.id})`);
  }

  // JSON 갱신 (트랜잭션 밖)
  if (jsonFixes.length) {
    for (const f of jsonFixes) mapJson[f.key].ourId = f.to;
    fs.writeFileSync(MAP_FILE, JSON.stringify(mapJson, null, 2) + "\n");
    console.log(`[APPLY] team-id-mapping.json ${jsonFixes.length}건 갱신`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
