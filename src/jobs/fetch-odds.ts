// The Odds API에서 향후 SCHEDULED 매치의 1X2 odds 가져와 Match 에 저장.
// API 무료 한도 절약 위해 리그 단위 한 번 호출 → 매치 매칭.

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchLeagueOdds,
  impliedFromOdds,
  averageH2h,
  averageTotals,
  averageSpread,
  averageBtts,
  averageDoubleChance,
  normalizeOddsTeamName,
  ODDS_SUPPORTED_LEAGUES,
} from "@/lib/odds/odds-api";

export async function runFetchOdds(opts?: { leagues?: string[] }) {
  const leagues = opts?.leagues ?? ODDS_SUPPORTED_LEAGUES;
  console.log(`[odds] 시작 — leagues=${leagues.join(",")}`);

  const tally: Record<string, number> = {};

  for (const league of leagues) {
    try {
      const events = await fetchLeagueOdds(league);
      if (events.length === 0) {
        console.log(`[odds/${league}] 0건`);
        continue;
      }

      // 우리 DB의 향후 SCHEDULED 매치 가져옴 (odds API 응답과 매칭)
      const dbMatches = await prisma.match.findMany({
        where: {
          league,
          status: "SCHEDULED",
          startTime: {
            gte: new Date(),
            lte: new Date(Date.now() + 14 * 24 * 3600 * 1000),
          },
        },
        include: { homeTeam: true, awayTeam: true },
      });

      let matched = 0;
      for (const m of dbMatches) {
        const homeN = normalizeOddsTeamName(m.homeTeam.name);
        const awayN = normalizeOddsTeamName(m.awayTeam.name);
        const ev = events.find((e) => {
          const eh = normalizeOddsTeamName(e.home_team);
          const ea = normalizeOddsTeamName(e.away_team);
          return (
            (eh.includes(homeN) || homeN.includes(eh)) &&
            (ea.includes(awayN) || awayN.includes(ea))
          );
        });
        if (!ev) continue;
        const implied = impliedFromOdds(ev);
        if (!implied) continue;

        // raw decimal odds — UI 표시용
        const h2h = averageH2h(ev);
        const totals = averageTotals(ev);
        const spread = averageSpread(ev);
        const btts = averageBtts(ev);
        const dc = averageDoubleChance(ev);

        // 오프닝 odds — 매치당 한 번만 저장 (이미 있으면 미터치)
        const openingPatch =
          m.openingMarketHome == null
            ? {
                openingMarketHome: implied.home,
                openingMarketDraw: implied.draw,
                openingMarketAway: implied.away,
                openingCapturedAt: new Date(),
              }
            : {};
        await prisma.match.update({
          where: { id: m.id },
          data: {
            marketHome: implied.home,
            marketDraw: implied.draw,
            marketAway: implied.away,
            marketBookmakers: implied.consensus,
            marketUpdatedAt: new Date(),
            ...openingPatch,
            // raw decimal odds (vig 미제거)
            oddsHome: h2h?.home ?? null,
            oddsDraw: h2h?.draw ?? null,
            oddsAway: h2h?.away ?? null,
            oddsTotalLine: totals?.line ?? null,
            oddsOver: totals?.over ?? null,
            oddsUnder: totals?.under ?? null,
            oddsHcLine: spread?.line ?? null,
            oddsHcHome: spread?.homeOdds ?? null,
            oddsHcAway: spread?.awayOdds ?? null,
            oddsBttsYes: btts?.yes ?? null,
            oddsBttsNo: btts?.no ?? null,
            oddsDc1X: dc?.oneX ?? null,
            oddsDc12: dc?.twelve ?? null,
            oddsDcX2: dc?.xTwo ?? null,
          },
        });
        matched++;
      }
      tally[league] = matched;
      console.log(
        `[odds/${league}] events=${events.length}, matched ${matched}/${dbMatches.length}`,
      );
    } catch (err) {
      console.error(`[odds/${league}] 실패:`, (err as Error).message);
    }
  }

  console.log("[odds] 완료:", tally);
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchOdds()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
