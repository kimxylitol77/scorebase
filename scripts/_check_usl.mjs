import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 5/21 USL 매치
const now = new Date();
const since = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
const stale = await prisma.match.findMany({
  where: {
    status: "SCHEDULED",
    startTime: { lt: new Date(now.getTime() - 4 * 3600 * 1000) }, // 시작 4시간 전 + 인데 아직 SCHEDULED
    NOT: { startTime: { lt: since } }, // 너무 옛 매치 제외
  },
  include: { homeTeam: true, awayTeam: true },
  orderBy: { startTime: "asc" },
});
console.log("=== stale SCHEDULED 매치 (시작 4h+ 지났는데 SCHEDULED 인 것) ===");
console.log("총", stale.length, "건");
for (const m of stale) {
  console.log(
    `${m.startTime.toISOString()} | ${m.league.padEnd(15)} | ${m.awayTeam.name} vs ${m.homeTeam.name} | ext=${m.externalId} | status=${m.status} | updated=${m.updatedAt.toISOString()}`,
  );
}
await prisma.$disconnect();
