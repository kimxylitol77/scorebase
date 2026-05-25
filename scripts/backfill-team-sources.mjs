// scripts/backfill-team-sources.mjs
// 기존 Team row 에 TeamSourceId 매핑을 backfill.
// 두 가지 입력:
//   1) src/lib/sports/thesports/team-id-mapping.json → source='thesports' 명시 매핑
//   2) Team.externalId 의 패턴 + 리그별 primary collector 매핑 → 추정 source row
//
// 같은 (league, source, externalId) 가 이미 있으면 P2002 로 skip (idempotent).
//
// 사용:
//   node --env-file=.env.local scripts/backfill-team-sources.mjs           # dry-run
//   node --env-file=.env.local scripts/backfill-team-sources.mjs --apply   # 실제 실행

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// 리그 → primary collector source (src/lib/sports/index.ts 기반).
// buildSoccerCollector(X) = espn-soccer, buildApiFootballCollector(X) = api-football.
const LEAGUE_PRIMARY_SOURCE = {
  // buildSoccerCollector → espn-soccer
  LALIGA: "espn",
  BUNDESLIGA: "espn",
  SERIE_A: "espn",
  LIGUE_1: "espn",
  MLS: "espn",
  UCL: "espn",
  // ESPN 전용
  NHL: "espn",
  MLB: "espn",
  // NBA 는 API_FOOTBALL_KEY 있으면 api-sports, 아니면 espn (현 production 은 api-sports)
  NBA: "api-sports",
  // EPL 은 FOOTBALL_DATA_KEY 있으면 football-data, 아니면 api-football
  EPL: process.env.FOOTBALL_DATA_KEY ? "football-data" : "api-football",
  // 농구 여자
  WNBA: "api-sports",
  // 자체 / 별도 collector
  KBO: "kbo",
  NPB: "npb",
  LOL: "leaguepedia",
  WORLD_CUP: "world-cup",
};

// 위에 명시 안 된 리그는 buildApiFootballCollector(X) 사용 → source='api-football'
const DEFAULT_SOURCE = "api-football";

function inferSourceFromTeam(externalId, league) {
  if (!externalId) return "legacy";
  // thesports team id = alphanumeric 14+ 자, 알파벳+숫자 혼합
  if (
    externalId.length >= 14 &&
    /[a-z]/i.test(externalId) &&
    /[0-9]/.test(externalId) &&
    /^[a-z0-9]+$/i.test(externalId)
  ) {
    return "thesports";
  }
  return LEAGUE_PRIMARY_SOURCE[league] ?? DEFAULT_SOURCE;
}

function normalizeTeamName(s) {
  return (s ?? "")
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club|de|el)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

async function main() {
  console.log(`▶ Team source backfill (${APPLY ? "APPLY" : "dry-run"})\n`);

  // 1) ts mapping JSON → source='thesports'
  const mappingPath = path.join(
    process.cwd(),
    "src/lib/sports/thesports/team-id-mapping.json",
  );
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
  console.log(`ts mapping JSON entries: ${mapping.length}`);

  // 2) 현재 Team row
  const teams = await prisma.team.findMany({
    select: { id: true, league: true, externalId: true, name: true },
  });
  console.log(`Team rows in DB: ${teams.length}`);

  const teamIds = new Set(teams.map((t) => t.id));

  // 리그별 normalize-name → Team.id 인덱스 (stale mapping recovery 용)
  const nameIdx = new Map();
  for (const t of teams) {
    const k = `${t.league}|${normalizeTeamName(t.name)}`;
    if (!nameIdx.has(k)) nameIdx.set(k, []);
    nameIdx.get(k).push(t.id);
  }

  const allRows = [];

  // ts mapping → source='thesports' (단, teamId 가 DB 에 실제 존재할 때만)
  let tsOrphan = 0;
  let tsRecovered = 0;
  for (const e of mapping) {
    if (!e.tsId || !e.ourLeague) continue;
    let teamId = e.ourId;
    if (!teamId || !teamIds.has(teamId)) {
      // stale ourId — name fuzzy match 로 canonical Team 복구
      const k = `${e.ourLeague}|${normalizeTeamName(e.ourName ?? e.tsName)}`;
      const candidates = nameIdx.get(k);
      if (candidates && candidates.length === 1) {
        teamId = candidates[0];
        tsRecovered++;
      } else {
        tsOrphan++;
        continue;
      }
    }
    allRows.push({
      league: e.ourLeague,
      source: "thesports",
      externalId: e.tsId,
      teamId,
    });
  }
  if (tsRecovered > 0) {
    console.log(`  (ts mapping stale ourId 중 ${tsRecovered} 개는 name fuzzy match 로 복구)`);
  }
  if (tsOrphan > 0) {
    console.log(`  (ts mapping 중 ${tsOrphan} 개 ourId 는 DB 에 없고 fuzzy 매칭도 실패 → skip)`);
  }

  // Team primary source 추론
  const sourceStats = {};
  for (const t of teams) {
    const src = inferSourceFromTeam(t.externalId, t.league);
    sourceStats[src] = (sourceStats[src] ?? 0) + 1;
    allRows.push({
      league: t.league,
      source: src,
      externalId: t.externalId,
      teamId: t.id,
    });
  }

  console.log("\nPrimary source 추론 결과 (Team row 별):");
  for (const [src, cnt] of Object.entries(sourceStats).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${src}: ${cnt}`);
  }
  console.log(`\n총 insert 예정 row: ${allRows.length}`);

  if (!APPLY) {
    // dry-run 추가 검증: 같은 (league, source, externalId) 중복 카운트
    const seen = new Set();
    let dupInPlan = 0;
    for (const r of allRows) {
      const k = `${r.league}|${r.source}|${r.externalId}`;
      if (seen.has(k)) dupInPlan++;
      seen.add(k);
    }
    if (dupInPlan > 0) {
      console.log(
        `\n⚠ plan 내부 중복 (같은 key): ${dupInPlan} (FK 가 같은 row 면 OK, 다르면 충돌)`,
      );
    }
    console.log("\n[dry-run] no changes — --apply 로 실행");
    await prisma.$disconnect();
    return;
  }

  // 실제 insert. createMany + skipDuplicates 로 batch — Neon 부하 회피 batch=500.
  console.log("\n=== APPLY ===");
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const chunk = allRows.slice(i, i + BATCH);
    try {
      const res = await prisma.teamSourceId.createMany({
        data: chunk,
        skipDuplicates: true,
      });
      inserted += res.count;
      process.stdout.write(
        `  ${i + chunk.length}/${allRows.length} (inserted ${inserted})\r`,
      );
    } catch (e) {
      console.error(`\nbatch ${i} failed:`, e.message);
      // FK 위반 (P2003) 같은 케이스 — 개별 retry
      for (const row of chunk) {
        try {
          await prisma.teamSourceId.create({ data: row });
          inserted++;
        } catch (e2) {
          if (e2.code !== "P2002" && e2.code !== "P2003") {
            console.error(`  row fail: ${JSON.stringify(row)}: ${e2.message}`);
          }
        }
      }
    }
  }
  console.log(`\n\n✓ Total inserted: ${inserted}`);

  // 최종 통계
  const finalCount = await prisma.teamSourceId.count();
  const finalBySource = await prisma.teamSourceId.groupBy({
    by: ["source"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });
  console.log(`\nTeamSourceId 최종 row 수: ${finalCount}`);
  console.log("By source:");
  for (const r of finalBySource) {
    console.log(`  ${r.source}: ${r._count.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
