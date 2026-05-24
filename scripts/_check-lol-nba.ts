import { prisma } from "../src/lib/db";

async function main() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 5 * 24 * 3600 * 1000);

  for (const league of ["LOL", "NBA"]) {
    console.log(`\n=== ${league} ===`);
    const matches = await prisma.match.findMany({
      where: {
        league,
        status: "SCHEDULED",
        startTime: { gte: now, lte: horizon },
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "asc" },
    });

    const finished = await prisma.match.count({
      where: { league, status: "FINISHED" },
    });

    console.log(`SCHEDULED in 5d: ${matches.length}, FINISHED 누적: ${finished}`);
    for (const m of matches) {
      const article = await prisma.article.findFirst({
        where: { matchId: m.id, type: "PREVIEW" },
        select: { id: true, status: true, publishedAt: true },
      });
      console.log(
        `  match#${m.id}  ${m.startTime.toISOString().slice(0, 16)}  ${m.homeTeam.name} vs ${m.awayTeam.name}  ext=${m.externalId}  preview=${article ? article.status : "NONE"}`,
      );
      // odds 정보
      console.log(
        `    odds: home=${m.marketHome ?? "-"} draw=${m.marketDraw ?? "-"} away=${m.marketAway ?? "-"}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
