import { prisma } from "../src/lib/db";

async function main() {
const now = new Date();
const cutoff = new Date(now.getTime() - 30 * 60 * 1000);

const rows = await prisma.theSportsMatchCache.findMany({
  where: { updatedAt: { gte: cutoff } },
  include: {
    match: {
      select: {
        league: true,
        externalId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        status: true,
        startTime: true,
      },
    },
  },
  orderBy: { updatedAt: "desc" },
});

console.log(`최근 30분 cache 업데이트: ${rows.length}건`);
for (const r of rows) {
  const ageMs = now.getTime() - r.updatedAt.getTime();
  console.log(
    `  ${(ageMs / 1000).toFixed(0)}s ago | ${r.match.league} | ${r.match.awayTeam.name} vs ${r.match.homeTeam.name} | DB.status=${r.match.status}`,
  );
}
console.log(
  `\nMLB cache 매치만 (전체):`,
);
const mlb = await prisma.theSportsMatchCache.count({
  where: { match: { league: "MLB" } },
});
console.log(`  TheSportsMatchCache 의 MLB 매치 총 ${mlb}건`);
await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
