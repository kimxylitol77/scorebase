// TeamSourceId 매핑 오염 전수 스캔 (읽기 전용).
// 하나의 (source, externalId) 가 서로 다른 대륙연맹/종목의 Team row 에 걸친 케이스를 뽑는다.
// 같은 클럽의 도메스틱+컵 분열(같은 연맹)은 정상으로 걸러내고, 이름 매칭 오염(동명 이클럽)만 남긴다.
//
// 사용:
//   node --env-file=.env.local scripts/scan-teamsourceid-contamination.mjs [--source=thesports]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_FILTER =
  process.argv.find((a) => a.startsWith("--source="))?.split("=")[1] ?? null;

// 리그 → 대륙연맹/종목 버킷. 한 그룹이 서로 다른 버킷에 걸치면 = 다른 실제 클럽 = 오염.
const CONF = {
  // UEFA
  BUNDESLIGA: "UEFA", BUNDESLIGA_2: "UEFA", CHALLENGE_LEAGUE: "UEFA",
  CYPRUS_1D: "UEFA", CZECH_2: "UEFA", CZECH_L: "UEFA", DENMARK_SL: "UEFA",
  EPL: "UEFA", EREDIVISIE: "UEFA", GREEK_SL: "UEFA", LALIGA: "UEFA",
  LIGUE_1: "UEFA", PRIMEIRA_LIGA: "UEFA", SERIE_A: "UEFA", SUPER_LIG: "UEFA",
  SWISS_SL: "UEFA", UCL: "UEFA", UEL: "UEFA", UECL: "UEFA", WSL: "UEFA",
  UEFA_WCL: "UEFA", KAZAKHSTAN_PL: "UEFA",
  // CONMEBOL
  BRASILEIRAO: "CONMEBOL", CHILE_PD: "CONMEBOL", COLOMBIA_PA: "CONMEBOL",
  COPA_LIB: "CONMEBOL", COPA_SUD: "CONMEBOL", ECUADOR_LP: "CONMEBOL",
  PERU_PD: "CONMEBOL", VENEZUELA_PD: "CONMEBOL", ARGENTINA_LPF: "CONMEBOL",
  // AFC
  AFC_CL: "AFC", AFC_CL_TWO: "AFC", CSL: "AFC", J1_LEAGUE: "AFC",
  K_LEAGUE_1: "AFC", QATAR_SL: "AFC", SAUDI_PL: "AFC", UAE_PL: "AFC",
  AFC_U23: "AFC",
  // CONCACAF
  CANADA_PL: "CONCACAF", CONCACAF_CCUP: "CONCACAF", MLS: "CONCACAF",
  // 종목(축구 아님)
  NBA: "BASKETBALL", NHL: "HOCKEY", MLB: "BASEBALL", KBO: "BASEBALL",
  NPB: "BASEBALL",
};

function confOf(league) {
  return CONF[league] ?? `OTHER:${league}`;
}

async function main() {
  const where = { source: SOURCE_FILTER ? SOURCE_FILTER : undefined };
  const all = await prisma.teamSourceId.findMany({
    where,
    select: {
      id: true, source: true, externalId: true, league: true, teamId: true,
      team: {
        select: { id: true, name: true, nameKo: true, league: true, country: true },
      },
    },
  });

  // 그룹핑
  const groups = new Map();
  for (const r of all) {
    const key = `${r.source}|${r.externalId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // 오염 후보 = 여러 teamId AND 여러 연맹 버킷
  const contaminated = [];
  for (const [key, rows] of groups) {
    if (new Set(rows.map((r) => r.teamId)).size <= 1) continue;
    const confs = new Set(rows.map((r) => confOf(r.team.league)));
    if (confs.size <= 1) continue; // 같은 연맹 = 정상 컵 분열
    contaminated.push({ key, rows, confs });
  }

  // 각 teamId 의 경기 수 (주인 판단용)
  const teamIds = [...new Set(contaminated.flatMap((c) => c.rows.map((r) => r.teamId)))];
  const matchCounts = new Map();
  for (const tid of teamIds) {
    const n = await prisma.match.count({
      where: { OR: [{ homeTeamId: tid }, { awayTeamId: tid }] },
    });
    matchCounts.set(tid, n);
  }

  console.log("=".repeat(78));
  console.log(`오염 후보 (연맹/종목 교차): ${contaminated.length}건` +
    (SOURCE_FILTER ? `  [source=${SOURCE_FILTER}]` : ""));
  console.log("=".repeat(78));

  for (const c of contaminated.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`\n● ${c.key}  연맹=[${[...c.confs].join(", ")}]`);
    // teamId 별로 묶어서 출력
    const byTeam = new Map();
    for (const r of c.rows) {
      if (!byTeam.has(r.teamId)) byTeam.set(r.teamId, { team: r.team, maps: [] });
      byTeam.get(r.teamId).maps.push(r);
    }
    for (const [tid, info] of byTeam) {
      const mc = matchCounts.get(tid) ?? 0;
      const conf = confOf(info.team.league);
      console.log(
        `    teamId=${tid}  conf=${conf}  matches=${mc}  ` +
        `"${info.team.name}"${info.team.nameKo ? ` (${info.team.nameKo})` : ""}  ` +
        `teamLeague=${info.team.league}  country=${info.team.country ?? "-"}`,
      );
      for (const m of info.maps) {
        console.log(`        └ tsid_row#${m.id}  mapLeague=${m.league}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
