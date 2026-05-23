import { prisma } from "../src/lib/db";
async function main() {
  const teams = await prisma.team.findMany({ where: { league: "LALIGA" }, select: { id: true, externalId: true, name: true }, take: 5 });
  console.log("LALIGA teams (5):");
  for (const t of teams) console.log(`  id=${t.id} externalId=${t.externalId} name=${t.name}`);
  // Real Madrid id=1 specifically
  const rm = await prisma.team.findUnique({ where: { id: 1 }, select: { id: true, externalId: true, name: true, league: true } });
  console.log("\nTeam id=1:", rm);
}
main().catch(console.error).finally(() => prisma.$disconnect());
