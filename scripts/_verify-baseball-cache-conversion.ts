// 변환 helper 검증 — cache 가 있는 KBO/NPB/MLB 매치를 BaseballLive 로 변환해서 출력.
// 사용: npx tsx scripts/_verify-baseball-cache-conversion.ts

import { prisma } from "../src/lib/db";
import { convertCacheToBaseballLive } from "../src/lib/sports/thesports/baseball-live";

async function main() {
  const caches = await prisma.theSportsMatchCache.findMany({
    where: { match: { league: { in: ["KBO", "NPB", "MLB"] } } },
    include: {
      match: {
        select: {
          status: true,
          league: true,
          externalId: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  console.log(`=== ${caches.length}건 변환 검증 ===\n`);
  for (const c of caches) {
    const m = c.match;
    const converted = convertCacheToBaseballLive({
      detailLive: c.detailLive,
      dbStatus: m.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED",
      dbHomeScore: m.homeScore,
      dbAwayScore: m.awayScore,
      homeName: m.homeTeam.name,
      awayName: m.awayTeam.name,
      league: m.league as "KBO" | "NPB" | "MLB",
    });
    console.log(`--- ${m.league} #${m.externalId} ${m.awayTeam.name} @ ${m.homeTeam.name} (DB ${m.status}, ${m.awayScore}-${m.homeScore}) ---`);
    if (!converted) {
      console.log("  ❌ 변환 실패");
      continue;
    }
    console.log(`  status: ${converted.status} (${converted.statusLabel})`);
    console.log(`  away ${converted.awayTeam.name}: ${converted.awayTeam.score} (H${converted.awayTeam.hits}/E${converted.awayTeam.errors})`);
    console.log(`  home ${converted.homeTeam.name}: ${converted.homeTeam.score} (H${converted.homeTeam.hits}/E${converted.homeTeam.errors})`);
    console.log(`  linescore innings: ${converted.linescore?.home.length ?? 0}`);
    if (converted.linescore) {
      console.log(`    away: [${converted.linescore.away.join(",")}]`);
      console.log(`    home: [${converted.linescore.home.join(",")}]`);
    }
    if (converted.liveContext) {
      console.log(`  base: ${converted.liveContext.bases}, out: ${converted.liveContext.outs}, B/S: ${converted.liveContext.bad}/${converted.liveContext.good}`);
    }
    // DB 와 점수 일치 검증
    const homeMatch = converted.homeTeam.score === m.homeScore;
    const awayMatch = converted.awayTeam.score === m.awayScore;
    console.log(`  점수 일치: ${homeMatch && awayMatch ? "✓" : `❌ DB(${m.homeScore}-${m.awayScore}) vs cache(${converted.homeTeam.score}-${converted.awayTeam.score})`}`);
    console.log();
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
