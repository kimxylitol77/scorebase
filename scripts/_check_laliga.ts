import { prisma } from "../src/lib/db";
async function main() {
  const c = await prisma.theSportsStandingsCache.findUnique({ where: { league: "LALIGA" }, select: { league: true, updatedAt: true, payload: true } });
  console.log("LALIGA cache:", c ? { league: c.league, updatedAt: c.updatedAt, payloadType: typeof c.payload, isArr: Array.isArray(c.payload) } : "NOT FOUND");
  // Real Madrid 매치 찾기
  const m = await prisma.match.findFirst({ where: { league: "LALIGA", homeTeam: { name: { contains: "Real Madrid" } } }, orderBy: { startTime: "desc" }, include: { homeTeam: true, awayTeam: true } });
  if (m) {
    console.log("Real Madrid 최근 매치:", m.homeTeam.name, "vs", m.awayTeam.name, "@", m.startTime.toISOString().slice(0,16));
    console.log("homeTeamId:", m.homeTeam.id, "awayTeamId:", m.awayTeam.id);
  }
}
main().catch(console.error).finally(() => (prisma as any).$disconnect());
