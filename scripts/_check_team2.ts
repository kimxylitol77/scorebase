import { prisma } from "../src/lib/db";
async function main() {
  const teams = await prisma.team.findMany({ where: { league: "EPL" }, select: { id: true, externalId: true, name: true }, take: 5 });
  console.log("EPL teams (5):");
  for (const t of teams) console.log(`  id=${t.id} externalId=${t.externalId} name=${t.name}`);
  // SERIE_A (동작 확인)
  const sa = await prisma.team.findMany({ where: { league: "SERIE_A" }, select: { id: true, externalId: true, name: true }, take: 3 });
  console.log("\nSERIE_A teams (3):");
  for (const t of sa) console.log(`  id=${t.id} externalId=${t.externalId} name=${t.name}`);
  // api-football standings EPL teamExternalId
  const af = await prisma.apiFootballStandingsCache.findUnique({ where: { league: "EPL" }, select: { rows: true } });
  if (af && Array.isArray(af.rows)) {
    console.log("\napi-football EPL teamExternalId (5):");
    for (const r of (af.rows as any[]).slice(0, 5)) console.log(`  ${r.teamExternalId} ${r.position}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
