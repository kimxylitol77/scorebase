// scripts/dedup-teams.mjs
// Team 테이블에서 같은 리그·같은 normalize 이름의 중복 row 제거.
// 두 source(TheSports + api-football) 가 같은 팀을 각자 ext id 로 들여놔서 생긴 dup.
//
// 정책 (2026-05-25):
//   - canonical = 그룹 내 Match 참조 수 가장 많은 row (tie 면 id 작은 쪽)
//   - LALIGA + J1_LEAGUE 만 처리 (NBA 는 별도 검증 필요, SUI_CUP false positive 제외)
//   - 비-canonical 의 Match.homeTeamId/awayTeamId 를 canonical 로 update
//   - team-id-mapping.json 의 ourId 가 삭제 대상 가리키면 canonical 로 교체
//
// 사용:
//   node --env-file=.env.local scripts/dedup-teams.mjs           # dry-run
//   node --env-file=.env.local scripts/dedup-teams.mjs --apply   # 실제 실행

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const TARGET_LEAGUES = ["LALIGA", "J1_LEAGUE"];

function normalizeTeamName(s) {
  return s
    .toLowerCase()
    .replace(
      /\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club|de|el|ca|hotspur|wanderers)\b/g,
      "",
    )
    .replace(/[^a-z0-9가-힣]/g, "");
}

async function buildPlan() {
  const teams = await prisma.team.findMany({
    where: { league: { in: TARGET_LEAGUES } },
    select: { id: true, league: true, name: true, externalId: true },
  });
  const groups = new Map(); // key=league|norm → rows[]
  for (const t of teams) {
    const norm = normalizeTeamName(t.name);
    if (!norm) continue;
    const k = `${t.league}|${norm}`;
    const arr = groups.get(k) ?? [];
    arr.push(t);
    groups.set(k, arr);
  }
  const plan = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const counts = await Promise.all(
      rows.map(async (t) => ({
        ...t,
        cnt: await prisma.match.count({
          where: { OR: [{ homeTeamId: t.id }, { awayTeamId: t.id }] },
        }),
      })),
    );
    counts.sort((a, b) => b.cnt - a.cnt || a.id - b.id);
    const [canonical, ...rest] = counts;
    plan.push({ key, canonical, dups: rest });
  }
  return plan;
}

async function main() {
  console.log(`▶ Team dedup (${APPLY ? "APPLY" : "dry-run"}) — target ${TARGET_LEAGUES.join(", ")}\n`);

  const plan = await buildPlan();

  let totalDelete = 0;
  let totalUpdateMatches = 0;

  console.log("=== 계획 ===");
  for (const { key, canonical, dups } of plan) {
    const [lg, norm] = key.split("|");
    console.log(`[${lg}] ${norm}: keep id=${canonical.id}(${canonical.cnt}m) ext=${canonical.externalId}`);
    for (const d of dups) {
      console.log(`        del id=${d.id}(${d.cnt}m) ext=${d.externalId} → ${d.cnt > 0 ? `Match FK→${canonical.id}` : "no Match"}`);
      totalDelete += 1;
      totalUpdateMatches += d.cnt;
    }
  }
  console.log(`\n총 삭제 row: ${totalDelete}`);
  console.log(`총 Match FK 이전: ${totalUpdateMatches}`);

  // ts mapping JSON 갱신 계획
  const mappingPath = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  const idRemap = new Map(); // old ourId → new ourId
  for (const { canonical, dups } of plan) {
    for (const d of dups) idRemap.set(d.id, canonical.id);
  }
  const mappingChanges = [];
  for (const e of mapping) {
    if (idRemap.has(e.ourId)) {
      mappingChanges.push({ tsId: e.tsId, tsName: e.tsName, old: e.ourId, new: idRemap.get(e.ourId) });
    }
  }
  console.log(`\nts mapping 갱신: ${mappingChanges.length} entries`);
  for (const c of mappingChanges.slice(0, 10)) {
    console.log(`  ${c.tsName} (ts=${c.tsId}): ourId ${c.old} → ${c.new}`);
  }
  if (mappingChanges.length > 10) console.log(`  ... 외 ${mappingChanges.length - 10}건`);

  if (!APPLY) {
    console.log("\n[dry-run] 실제 변경 없음. --apply 로 실행.");
    await prisma.$disconnect();
    return;
  }

  // 실제 실행 — 트랜잭션
  console.log("\n=== APPLY ===");
  await prisma.$transaction(
    async (tx) => {
      for (const { canonical, dups } of plan) {
        for (const d of dups) {
          if (d.cnt > 0) {
            const home = await tx.match.updateMany({
              where: { homeTeamId: d.id },
              data: { homeTeamId: canonical.id },
            });
            const away = await tx.match.updateMany({
              where: { awayTeamId: d.id },
              data: { awayTeamId: canonical.id },
            });
            console.log(`  ↪ id=${d.id} → ${canonical.id}: home ${home.count}, away ${away.count} 이전`);
          }
          // TeamSourceId 이전 — (league, source, externalId) 가 canonical 에 없으면 teamId update.
          // 있으면 그대로 두고 Team delete 시 FK CASCADE 로 정리됨.
          const dupSources = await tx.teamSourceId.findMany({
            where: { teamId: d.id },
            select: { id: true, league: true, source: true, externalId: true },
          });
          let migrated = 0;
          let dropped = 0;
          for (const ts of dupSources) {
            const conflict = await tx.teamSourceId.findUnique({
              where: {
                league_source_externalId: {
                  league: ts.league,
                  source: ts.source,
                  externalId: ts.externalId,
                },
              },
              select: { id: true, teamId: true },
            });
            if (conflict && conflict.teamId === canonical.id) {
              // canonical 에 이미 같은 mapping 있음 — d 의 row 는 cascade 로 사라짐
              dropped++;
              continue;
            }
            // canonical 에 없는 mapping → teamId 이전
            await tx.teamSourceId.update({
              where: { id: ts.id },
              data: { teamId: canonical.id },
            });
            migrated++;
          }
          if (dupSources.length > 0) {
            console.log(
              `  ↪ TeamSourceId: ${migrated} 이전, ${dropped} cascade drop (id=${d.id})`,
            );
          }
          await tx.team.delete({ where: { id: d.id } });
          console.log(`  ✗ del id=${d.id}`);
        }
      }
    },
    { timeout: 120_000 },
  );

  // mapping JSON 갱신
  if (mappingChanges.length > 0) {
    for (const e of mapping) {
      if (idRemap.has(e.ourId)) e.ourId = idRemap.get(e.ourId);
    }
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + "\n");
    console.log(`\n✓ team-id-mapping.json 갱신: ${mappingChanges.length} entries`);
  }

  console.log("\n✓ 완료");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
