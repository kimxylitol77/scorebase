import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const all = await prisma.liveCommentary.findMany({
  select: { matchId: true, matchSummary: true },
});
const cjkRe = /[一-鿿]/g;
const toDelete = all.filter((r) => {
  const m = r.matchSummary?.match(cjkRe);
  return m && m.length >= 5;
});
console.log("total rows:", all.length, "cjk rows:", toDelete.length);
for (const r of toDelete) {
  await prisma.liveCommentary.update({
    where: { matchId: r.matchId },
    data: { matchSummary: null, summaryAt: null, scoreSnapshot: null },
  });
  console.log("cleared matchId=", r.matchId);
}
await prisma.$disconnect();
