import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1. Team.shortName 채워진 비율 (NPB/KBO/NHL/MLS/NBA)
  const targetLeagues = ["KBO", "NPB", "NHL", "MLS", "NBA", "LIGA_MX", "A_LEAGUE", "LOL"];
  console.log("=== Team.shortName coverage ===");
  for (const lg of targetLeagues) {
    const all = await prisma.team.findMany({ where: { league: lg }, select: { name: true, shortName: true } });
    const withShort = all.filter((t) => t.shortName && t.shortName.trim().length > 0);
    console.log(`${lg}: ${withShort.length}/${all.length} shortName 보유`);
    if (withShort.length > 0 && withShort.length < 5) {
      for (const t of withShort) console.log(`  • ${t.name} → ${t.shortName}`);
    }
  }

  // 2. LeagueLeader 의 season 값 distinct (리그별)
  console.log("\n=== LeagueLeader season per league ===");
  const allLeaders = await prisma.leagueLeader.findMany({ select: { league: true, season: true } });
  const seasonsByLeague = new Map<string, Set<string>>();
  for (const r of allLeaders) {
    if (!seasonsByLeague.has(r.league)) seasonsByLeague.set(r.league, new Set());
    seasonsByLeague.get(r.league)!.add(r.season);
  }
  for (const [lg, ss] of [...seasonsByLeague].sort()) {
    console.log(`  ${lg}: [${[...ss].sort().reverse().join(", ")}]`);
  }

  // 3. KBO/NPB/NHL/MLS LeagueLeader sample (teamName 실제 값)
  console.log("\n=== LeagueLeader teamName 샘플 (리그별 10개) ===");
  for (const lg of ["KBO", "NPB", "NHL", "MLS", "NBA", "BUNDESLIGA", "LOL", "UCL", "UEL", "LIGA_MX"]) {
    const rows = await prisma.leagueLeader.findMany({
      where: { league: lg },
      select: { teamName: true, playerName: true, season: true },
      take: 10,
    });
    console.log(`\n  ${lg}:`);
    const teamSet = new Set(rows.map((r) => r.teamName));
    for (const t of teamSet) console.log(`    • "${t}"`);
  }

  // 4. KBO Team.name 실제 (10개)
  console.log("\n=== 리그별 Team.name 실제 ===");
  for (const lg of ["KBO", "NPB", "NHL", "MLS", "NBA"]) {
    const all = await prisma.team.findMany({ where: { league: lg }, select: { name: true, shortName: true } });
    console.log(`\n  ${lg} (${all.length}팀):`);
    for (const t of all) console.log(`    • "${t.name}"${t.shortName ? ` (short: "${t.shortName}")` : ""}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
