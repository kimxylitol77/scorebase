import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const targets = [
    { league: "BRASILEIRAO", home: "Flamengo", away: "Palmeiras" },
    { league: "ECUADOR_LP", home: "Deportivo Cuenca", away: "LDU de Quito" },
    { league: "CSL", home: "Shanghai Shenhua", away: "Wuhan Three Towns" },
  ];
  for (const t of targets) {
    console.log(`\n=== ${t.league} ${t.home} vs ${t.away} ===`);
    const matches = await prisma.match.findMany({
      where: {
        league: t.league,
        OR: [
          { homeTeam: { name: t.home }, awayTeam: { name: t.away } },
          { homeTeam: { name: t.away }, awayTeam: { name: t.home } },
        ],
      },
      select: {
        id: true,
        externalId: true,
        status: true,
        startTime: true,
        homeTeam: { select: { id: true, name: true, externalId: true } },
        awayTeam: { select: { id: true, name: true, externalId: true } },
      },
      orderBy: { startTime: "asc" },
    });
    for (const m of matches) {
      console.log(
        `  id=${m.id} ext=${m.externalId} ${m.status} ${m.startTime.toISOString()} | ` +
          `home(id=${m.homeTeam.id},ext=${m.homeTeam.externalId},"${m.homeTeam.name}") vs ` +
          `away(id=${m.awayTeam.id},ext=${m.awayTeam.externalId},"${m.awayTeam.name}")`,
      );
    }
  }

  // 같은 이름인데 다른 Team.id (3 리그 한정)
  console.log(`\n=== 같은 이름 Team 중복 (BRASILEIRAO/ECUADOR_LP/CSL) ===`);
  for (const lg of ["BRASILEIRAO", "ECUADOR_LP", "CSL"]) {
    const teams = await prisma.team.findMany({ where: { league: lg }, select: { id: true, externalId: true, name: true } });
    const byName = new Map<string, typeof teams>();
    for (const t of teams) {
      const arr = byName.get(t.name) ?? [];
      arr.push(t);
      byName.set(t.name, arr);
    }
    for (const [name, items] of byName) {
      if (items.length > 1) {
        console.log(`\n  ${lg} — "${name}" Team 중복:`);
        for (const t of items) console.log(`    id=${t.id} ext=${t.externalId}`);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
