import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const since = new Date(Date.now() - 30 * 86400 * 1000);
const groups = await p.match.groupBy({
  by: ["league"],
  where: { startTime: { gte: since } },
  _count: { _all: true },
  orderBy: { _count: { league: "desc" } },
});
console.log("=== 최근 30일 매치 보유 리그 (활동 중) ===");
for (const g of groups) {
  console.log(`  ${g.league.padEnd(20)} ${g._count._all}건`);
}
console.log(`\n총 ${groups.length} 리그 활동 중`);
await p.$disconnect();
