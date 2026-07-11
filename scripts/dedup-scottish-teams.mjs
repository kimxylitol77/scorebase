// 스코틀랜드 클럽 Team 중복 11쌍 dedup (2026-07-11, SCO_LEAGUE_CUP 커버 중 발견).
//
// 배경: SCOT_CHAMPIONSHIP ts-* row 10개(609003~609012)는 standings stat-bridge 용으로
// 생성됐으나 Match 0 인 유령 row. 실제 매치는 전부 af row 쪽에 있음. 같은 tsId 가
// 매핑 JSON 에 2중 entry 로 존재해 standings_mismatch 오탐·팀 페이지 분산 원인.
//
// 처리:
//   1) 609003~609012 삭제 (Match 0 재검증 가드 후) — Phase 1 안전 삭제
//   2) 매핑 JSON 의 해당 stat-bridge entry ourId → canonical af row 로 remap
//      (ourLeague=SCOT_CHAMPIONSHIP 유지 → 리그 스코프 standings 조회 계속 동작)
//   3) Aberdeen 특수: UEL row(598126)는 유지(컵 row 구조 존중). 잘못 붙은
//      SCO_LEAGUE_CUP 매치 4개만 SPL row(119155)로 FK 이전 + srcId 이전 +
//      (SCO_LEAGUE_CUP, thesports) srcId 신설로 재발 차단
//
// 사용:
//   node --env-file=.env.local scripts/dedup-scottish-teams.mjs           # dry-run
//   node --env-file=.env.local scripts/dedup-scottish-teams.mjs --apply   # 실제 실행

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// [클럽, canonical(af, 유지), 삭제 대상(SCOT_CHAMPIONSHIP ts-*)]
const PAIRS = [
  ["Arbroath", 598618, 609005],
  ["Raith Rovers", 610784, 609007],
  ["Queen's Park", 610792, 609008],
  ["Airdrie United", 610775, 609011],
  ["Ross County", 610787, 609012],
  ["Saint Johnstone", 610710, 609003],
  ["Partick Thistle", 115932, 609004],
  ["Dunfermline Athletic", 115933, 609006],
  ["Ayr United", 610798, 609009],
  ["Greenock Morton", 610780, 609010],
];

const ABERDEEN = { uelRow: 598126, splRow: 119155, tsId: "z318q66hd2jqo9j", afExt: "252" };

async function main() {
  console.log(`▶ 스코틀랜드 Team dedup (${APPLY ? "APPLY" : "dry-run"})\n`);

  // 사전 가드: 삭제 대상 전부 Match 0 인지 재검증
  for (const [label, keepId, delId] of PAIRS) {
    const cnt = await prisma.match.count({
      where: { OR: [{ homeTeamId: delId }, { awayTeamId: delId }] },
    });
    const keep = await prisma.team.findUnique({ where: { id: keepId }, select: { name: true } });
    const del = await prisma.team.findUnique({ where: { id: delId }, select: { name: true } });
    if (!keep || !del) {
      console.log(`  ⚠ ${label}: row 없음 (keep=${keep ? "Y" : "N"} del=${del ? "Y" : "N"}) — skip 대상`);
      continue;
    }
    if (cnt > 0) {
      console.error(`  ✗ ${label}: 삭제 대상 id=${delId} 에 Match ${cnt}개 — Phase 1 전제 깨짐, 중단`);
      process.exit(1);
    }
    console.log(`  ${label}: keep id=${keepId} "${keep.name}" / del id=${delId} "${del.name}" (Match 0 확인)`);
  }

  // Aberdeen: UEL row 에 붙은 SCO_LEAGUE_CUP 매치 확인
  const abdnCupMatches = await prisma.match.findMany({
    where: {
      league: "SCO_LEAGUE_CUP",
      OR: [{ homeTeamId: ABERDEEN.uelRow }, { awayTeamId: ABERDEEN.uelRow }],
    },
    select: { id: true, startTime: true, homeTeamId: true, awayTeamId: true },
  });
  console.log(`\n  Aberdeen: UEL row(${ABERDEEN.uelRow}) SCO_LEAGUE_CUP 매치 ${abdnCupMatches.length}개 → SPL row(${ABERDEEN.splRow}) 이전 예정`);

  // 매핑 JSON remap 계획
  const mappingPath = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  const idRemap = new Map(PAIRS.map(([, keepId, delId]) => [delId, keepId]));
  const mappingChanges = mapping.filter((e) => idRemap.has(e.ourId));
  console.log(`\n  매핑 JSON remap: ${mappingChanges.length} entries`);
  for (const e of mappingChanges) {
    console.log(`    ${e.ourName} [${e.ourLeague}] ourId ${e.ourId} → ${idRemap.get(e.ourId)}`);
  }

  if (!APPLY) {
    console.log("\n[dry-run] 실제 변경 없음. --apply 로 실행.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== APPLY ===");
  await prisma.$transaction(
    async (tx) => {
      // 1) 유령 row 삭제 (TeamSourceId 는 cascade)
      for (const [label, , delId] of PAIRS) {
        const cnt = await tx.match.count({
          where: { OR: [{ homeTeamId: delId }, { awayTeamId: delId }] },
        });
        if (cnt > 0) throw new Error(`${label} id=${delId} Match ${cnt}개 — 중단(rollback)`);
        await tx.team.delete({ where: { id: delId } });
        console.log(`  ✗ del id=${delId} (${label})`);
      }

      // 2) Aberdeen SCO_LEAGUE_CUP 매치 FK 이전
      const h = await tx.match.updateMany({
        where: { league: "SCO_LEAGUE_CUP", homeTeamId: ABERDEEN.uelRow },
        data: { homeTeamId: ABERDEEN.splRow },
      });
      const a = await tx.match.updateMany({
        where: { league: "SCO_LEAGUE_CUP", awayTeamId: ABERDEEN.uelRow },
        data: { awayTeamId: ABERDEEN.splRow },
      });
      console.log(`  ↪ Aberdeen 컵 매치 이전: home ${h.count}, away ${a.count}`);

      // 3) Aberdeen srcId 이전 + thesports srcId 신설 (재발 차단)
      await tx.teamSourceId.updateMany({
        where: { league: "SCO_LEAGUE_CUP", source: "api-football", externalId: ABERDEEN.afExt },
        data: { teamId: ABERDEEN.splRow },
      });
      await tx.teamSourceId.upsert({
        where: {
          league_source_externalId: {
            league: "SCO_LEAGUE_CUP",
            source: "thesports",
            externalId: ABERDEEN.tsId,
          },
        },
        create: {
          league: "SCO_LEAGUE_CUP",
          source: "thesports",
          externalId: ABERDEEN.tsId,
          teamId: ABERDEEN.splRow,
        },
        update: { teamId: ABERDEEN.splRow },
      });
      console.log(`  ↪ Aberdeen srcId: af/252 → ${ABERDEEN.splRow}, thesports/${ABERDEEN.tsId} upsert`);
    },
    { timeout: 120_000 },
  );

  // 4) 매핑 JSON remap (트랜잭션 밖)
  for (const e of mapping) {
    if (idRemap.has(e.ourId)) e.ourId = idRemap.get(e.ourId);
  }
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + "\n");
  console.log(`\n✓ team-id-mapping.json remap: ${mappingChanges.length} entries`);

  console.log("\n✓ 완료");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
