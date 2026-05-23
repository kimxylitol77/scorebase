import { prisma } from "../src/lib/db";
async function main() {
  const af = await prisma.apiFootballStandingsCache.findUnique({ where: { league: "LALIGA" }, select: { league: true, updatedAt: true, rows: true } });
  console.log("api-football LALIGA cache:", af ? { updatedAt: af.updatedAt, rowsType: typeof af.rows, isArr: Array.isArray(af.rows), len: Array.isArray(af.rows) ? (af.rows as any[]).length : "?" } : "NOT FOUND");
  if (af && Array.isArray(af.rows) && (af.rows as any[]).length > 0) {
    console.log("first row:", JSON.stringify((af.rows as any[])[0]).slice(0,200));
  }
  // EPL 비교
  const ep = await prisma.apiFootballStandingsCache.findUnique({ where: { league: "EPL" }, select: { league: true, updatedAt: true, rows: true } });
  console.log("\napi-football EPL cache:", ep ? { updatedAt: ep.updatedAt, rowsLen: Array.isArray(ep.rows) ? (ep.rows as any[]).length : "?" } : "NOT FOUND");
}
main().catch(console.error).finally(() => prisma.$disconnect());
