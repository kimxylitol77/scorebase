// scripts/swap-estonia-georgia.mjs
// ESTONIA_ML ↔ GEORGIA_EL league 라벨 swap (양방향 일괄 교환).
//
// 원인 (2026-05-25 발견):
//   api-football league id swap 이전에 들어온 매치/팀이 잘못된 league 로 영구 저장.
//   ESTONIA_ML 안에 조지아 팀들 (Dinamo Tbilisi/Torpedo Kutaisi/Gagra 등),
//   GEORGIA_EL 안에 에스토니아 팀들 (Flora Tallinn/Paide/Vaprus 등).
//
// 처리: 4 테이블 + JSON 일괄 swap.
//   Match.league: ESTONIA_ML ↔ GEORGIA_EL
//   Team.league: ESTONIA_ML ↔ GEORGIA_EL
//   ApiFootballStandingsCache.league: 동일
//   TheSportsStandingsCache.league: 동일
//   src/lib/sports/thesports/team-id-mapping.json 의 ourLeague: 동일
//
// 트랜잭션 안에서 임시 라벨 사용해 unique 충돌 회피:
//   ESTONIA_ML → __TMP_ESTONIA__
//   GEORGIA_EL → ESTONIA_ML
//   __TMP_ESTONIA__ → GEORGIA_EL
//
// 사용:
//   node --env-file=.env.local scripts/swap-estonia-georgia.mjs           # dry-run
//   node --env-file=.env.local scripts/swap-estonia-georgia.mjs --apply   # 실행

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const A = "ESTONIA_ML";
const B = "GEORGIA_EL";
const TMP = "__SWAP_TMP__";

async function counts(label) {
  console.log(`\n=== ${label} ===`);
  for (const [tbl, queryFn] of [
    ["Match", (lg) => prisma.match.count({ where: { league: lg } })],
    ["Team", (lg) => prisma.team.count({ where: { league: lg } })],
    [
      "ApiFootballStandings",
      (lg) => prisma.apiFootballStandingsCache.count({ where: { league: lg } }),
    ],
    [
      "TheSportsStandings",
      (lg) => prisma.theSportsStandingsCache.count({ where: { league: lg } }),
    ],
  ]) {
    const a = await queryFn(A);
    const b = await queryFn(B);
    console.log(`  ${tbl.padEnd(22)} ${A}: ${a},  ${B}: ${b}`);
  }
}

async function main() {
  console.log(`▶ ESTONIA_ML ↔ GEORGIA_EL swap (${APPLY ? "APPLY" : "dry-run"})`);

  await counts("BEFORE");

  // Sample
  console.log("\n=== Sample (ESTONIA_ML 의 첫 3 팀, GEORGIA_EL 의 첫 3 팀) ===");
  const estTeams = await prisma.team.findMany({
    where: { league: A },
    select: { name: true },
    take: 3,
  });
  const geoTeams = await prisma.team.findMany({
    where: { league: B },
    select: { name: true },
    take: 3,
  });
  console.log(`  ${A}: ${estTeams.map((t) => t.name).join(", ")}`);
  console.log(`  ${B}: ${geoTeams.map((t) => t.name).join(", ")}`);

  if (!APPLY) {
    console.log("\n[dry-run] 실제 변경 없음. --apply 로 실행.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== APPLY ===");
  await prisma.$transaction(
    async (tx) => {
      // 3-step swap (임시 TMP 라벨로 unique 충돌 회피)
      for (const [tableName, update] of [
        ["Match", (where, data) => tx.match.updateMany({ where, data })],
        ["Team", (where, data) => tx.team.updateMany({ where, data })],
        [
          "ApiFootballStandingsCache",
          (where, data) => tx.apiFootballStandingsCache.updateMany({ where, data }),
        ],
        [
          "TheSportsStandingsCache",
          (where, data) => tx.theSportsStandingsCache.updateMany({ where, data }),
        ],
      ]) {
        const r1 = await update({ league: A }, { league: TMP });
        const r2 = await update({ league: B }, { league: A });
        const r3 = await update({ league: TMP }, { league: B });
        console.log(`  ${tableName.padEnd(28)} A→TMP: ${r1.count}, B→A: ${r2.count}, TMP→B: ${r3.count}`);
      }
    },
    { timeout: 120_000 },
  );

  // ts mapping JSON 의 ourLeague 도 swap
  const mappingPath = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  let mapChanged = 0;
  for (const e of mapping) {
    if (e.ourLeague === A) {
      e.ourLeague = B;
      mapChanged++;
    } else if (e.ourLeague === B) {
      e.ourLeague = A;
      mapChanged++;
    }
  }
  if (mapChanged > 0) {
    fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + "\n");
    console.log(`\n✓ team-id-mapping.json: ${mapChanged} entries swapped`);
  } else {
    console.log(`\n  team-id-mapping.json: 영향 entry 없음`);
  }

  await counts("AFTER");
  console.log("\n✓ 완료");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
