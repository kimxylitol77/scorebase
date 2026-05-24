// TheSports baseball cache sample 확인 — /api/live/baseball 갈아타기 작업용.
// 사용: npx tsx scripts/_inspect-baseball-cache.ts

import { prisma } from "../src/lib/db";

async function main() {
  // LIVE KBO/NPB/MLB 매치의 cache 한 row + 최근 종료 매치 한 row
  const liveCache = await prisma.theSportsMatchCache.findFirst({
    where: {
      match: {
        league: { in: ["KBO", "NPB", "MLB"] },
        status: "LIVE",
      },
    },
    include: {
      match: { select: { id: true, league: true, status: true, externalId: true, homeScore: true, awayScore: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log("=== LIVE 매치 cache 1건 ===");
  if (liveCache) {
    console.log(JSON.stringify({
      matchId: liveCache.matchId,
      tsMatchId: liveCache.tsMatchId,
      match: liveCache.match,
      updatedAt: liveCache.updatedAt,
      detailLive: liveCache.detailLive,
    }, null, 2));
  } else {
    console.log("LIVE cache 없음");
  }

  // 최근 종료 cache
  const finishedCache = await prisma.theSportsMatchCache.findFirst({
    where: {
      match: {
        league: { in: ["KBO", "NPB", "MLB"] },
        status: "FINISHED",
      },
    },
    include: {
      match: { select: { id: true, league: true, status: true, externalId: true, homeScore: true, awayScore: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  console.log("\n=== FINISHED 매치 cache 1건 ===");
  if (finishedCache) {
    console.log(JSON.stringify({
      matchId: finishedCache.matchId,
      tsMatchId: finishedCache.tsMatchId,
      match: finishedCache.match,
      updatedAt: finishedCache.updatedAt,
      detailLive: finishedCache.detailLive,
    }, null, 2));
  } else {
    console.log("FINISHED cache 없음");
  }

  // cache 가 있는 baseball 매치 총 카운트
  const total = await prisma.theSportsMatchCache.count({
    where: { match: { league: { in: ["KBO", "NPB", "MLB"] } } },
  });
  const byLeague = await prisma.match.groupBy({
    by: ["league"],
    where: {
      league: { in: ["KBO", "NPB", "MLB"] },
      theSportsCache: { isNot: null },
    },
    _count: true,
  });
  console.log(`\n=== baseball cache 통계 ===\n총 ${total}건`);
  for (const b of byLeague) console.log(`  ${b.league}: ${b._count}건`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
