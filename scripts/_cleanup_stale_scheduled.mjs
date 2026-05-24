// 시작 + N시간 후까지 SCHEDULED 인 매치 → POSTPONED 자동 변환.
// /scores 페이지의 status != POSTPONED 필터로 자동 제외됨.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const STALE_HOURS = parseInt(process.argv[2] ?? "6", 10);
const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
const list = await prisma.match.findMany({
  where: { status: "SCHEDULED", startTime: { lt: cutoff } },
  include: { homeTeam: true, awayTeam: true },
});
console.log(`stale SCHEDULED ${list.length}건 (시작 + ${STALE_HOURS}h+):`);
for (const m of list) {
  console.log(
    `  ${m.startTime.toISOString()} | ${m.league.padEnd(15)} | ${m.awayTeam.name} vs ${m.homeTeam.name} | ext=${m.externalId}`,
  );
}
if (process.argv.includes("--apply")) {
  const ids = list.map((m) => m.id);
  await prisma.match.updateMany({
    where: { id: { in: ids } },
    data: { status: "POSTPONED" },
  });
  console.log(`✓ ${ids.length}건 POSTPONED 처리`);
} else {
  console.log("(dry run — --apply 추가 시 실제 변경)");
}
await prisma.$disconnect();
