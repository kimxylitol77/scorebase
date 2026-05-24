import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const p = new PrismaClient();

// 1) standings cache 있는 리그
const caches = await p.theSportsStandingsCache.findMany({
  select: { league: true, fetchedAt: true },
});
console.log(`=== TheSports standings cache: ${caches.length} 리그 ===`);
const cacheSet = new Set(caches.map((c) => c.league));

// 2) 우리 SOCCER 리그 list 와 비교 — cache 없는 리그
const SOCCER = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO",
  "MLS", "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I",
  "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
  "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
  "ELITESERIEN", "NORWAY_1L", "ALLSVENSKAN", "SUPERETTAN",
  "VEIKKAUSLIIGA", "URVALSDEILD",
  "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL", "VIETNAM_VL1", "INDONESIA_L1", "SINGAPORE_PL",
  "CSL", "A_LEAGUE", "SAUDI_PL",
];
const missing = SOCCER.filter((l) => !cacheSet.has(l));
console.log(`\n=== standings cache 누락 리그 (${missing.length}/${SOCCER.length}) ===`);
console.log(missing.join(", "));

// 3) team-id-mapping 통계
const mapping = JSON.parse(
  readFileSync("/Users/kimss/scorebase/src/lib/sports/thesports/team-id-mapping.json", "utf8"),
);
console.log(`\n=== team-id-mapping: ${mapping.length} 팀 ===`);

// 4) 우리 DB SOCCER 팀 vs 매핑 누락
const ourTeams = await p.team.findMany({
  where: {
    OR: SOCCER.map((l) => ({
      homeMatches: { some: { league: l } },
    })),
  },
  select: { id: true, name: true },
  distinct: ["id"],
});
const mappedIds = new Set(mapping.map((m) => m.ourId));
const unmapped = ourTeams.filter((t) => !mappedIds.has(t.id));
console.log(`\n=== DB 축구 팀 ${ourTeams.length}, 매핑 안된 ${unmapped.length}개 ===`);
console.log("sample 미매핑:", unmapped.slice(0, 15).map((t) => t.name).join(", "));

await p.$disconnect();
