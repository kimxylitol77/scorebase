// The Odds API에서 향후 SCHEDULED 매치의 1X2 odds 가져와 Match 에 저장.
// API 무료 한도 절약 위해 리그 단위 한 번 호출 → 매치 매칭.
//
// LoL/LCK 는 The Odds API 가 esports 미지원 → 별도 source (Cloudbet primary, Pinnacle fallback) 사용.

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
import {
  fetchPinnacleLolMatches,
  fetchPinnacleMoneyline,
  vigFreeProb,
  americanToDecimal,
} from "@/lib/sports/pinnacle";
import {
  fetchCloudbetLolCompetitions,
  fetchCloudbetLckEvents,
  isCloudbetEnabled,
} from "@/lib/sports/cloudbet";

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

  // LoL/LCK — 별도 source (The Odds API esports 미지원)
  try {
    const lolMatched = await fetchLolOdds();
    tally["LOL"] = lolMatched;
  } catch (err) {
    console.error("[odds/LOL] 실패:", (err as Error).message);
  }

  console.log("[odds] 완료:", tally);
  return tally;
}

/* =====================================================================
 * LoL/LCK 전용 odds fetch — Cloudbet primary + Pinnacle fallback
 * ===================================================================*/

function normLolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(esports|e\s*sports|gaming|club|team|rolster|life)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

interface LolEventOdds {
  homeName: string;
  awayName: string;
  homeDecimal: number;
  awayDecimal: number;
  source: "cloudbet" | "pinnacle";
}

async function fetchLolEventOdds(): Promise<LolEventOdds[]> {
  const out: LolEventOdds[] = [];

  // 1) Cloudbet primary (key 있을 때)
  if (isCloudbetEnabled()) {
    try {
      const comps = await fetchCloudbetLolCompetitions();
      const lck = comps.find(
        (c) => /lck|korea|champions korea/i.test(c.name) || /lck/i.test(c.key),
      );
      if (lck) {
        const events = await fetchCloudbetLckEvents(lck.key);
        for (const ev of events) {
          out.push({
            homeName: ev.homeName,
            awayName: ev.awayName,
            homeDecimal: ev.homeDecimal,
            awayDecimal: ev.awayDecimal,
            source: "cloudbet",
          });
        }
        console.log(`[odds/LOL] Cloudbet ${events.length}건`);
      }
    } catch (err) {
      console.warn(`[odds/LOL] Cloudbet 실패:`, (err as Error).message);
    }
  }

  // 2) Pinnacle fallback (Cloudbet 결과 없거나 빈 경우 추가)
  if (out.length === 0) {
    try {
      const matches = await fetchPinnacleLolMatches();
      // LCK 만 (또는 Korea Qualifier 등 한국팀 포함 가능성)
      const lcks = matches.filter((m) =>
        /LCK|Korea/i.test(m.league?.name ?? ""),
      );
      console.log(
        `[odds/LOL] Pinnacle esports ${matches.length}매치 중 LCK ${lcks.length}매치`,
      );
      for (const m of lcks) {
        const ml = await fetchPinnacleMoneyline(m.id);
        if (!ml) continue;
        const home = m.participants.find((p) => p.alignment === "home")?.name;
        const away = m.participants.find((p) => p.alignment === "away")?.name;
        if (!home || !away) continue;
        out.push({
          homeName: home,
          awayName: away,
          homeDecimal: americanToDecimal(ml.homeAm),
          awayDecimal: americanToDecimal(ml.awayAm),
          source: "pinnacle",
        });
        // rate limit 회피
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      console.warn(`[odds/LOL] Pinnacle 실패:`, (err as Error).message);
    }
  }

  return out;
}

async function fetchLolOdds(): Promise<number> {
  const events = await fetchLolEventOdds();
  if (events.length === 0) {
    console.log("[odds/LOL] 0건 (LCK 매치 24h 이내일 때 odds 등록됨)");
    return 0;
  }

  const dbMatches = await prisma.match.findMany({
    where: {
      league: "LOL",
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
    const homeN = normLolName(m.homeTeam.name);
    const awayN = normLolName(m.awayTeam.name);
    const ev = events.find((e) => {
      const eh = normLolName(e.homeName);
      const ea = normLolName(e.awayName);
      const direct =
        (eh.includes(homeN) || homeN.includes(eh)) &&
        (ea.includes(awayN) || awayN.includes(ea));
      // home/away 가 베팅사 기준과 우리 DB 기준이 다를 수 있어 swap 도 허용
      const swap =
        (eh.includes(awayN) || awayN.includes(eh)) &&
        (ea.includes(homeN) || homeN.includes(ea));
      return direct || swap;
    });
    if (!ev) continue;

    const ehHome = normLolName(ev.homeName);
    const dbHome = normLolName(m.homeTeam.name);
    const aligned =
      ehHome.includes(dbHome) || dbHome.includes(ehHome);
    const dh = aligned ? ev.homeDecimal : ev.awayDecimal;
    const da = aligned ? ev.awayDecimal : ev.homeDecimal;

    // vig 제거 implied
    const pH = 1 / dh;
    const pA = 1 / da;
    const sum = pH + pA;
    const impliedHome = pH / sum;
    const impliedAway = pA / sum;

    const openingPatch =
      m.openingMarketHome == null
        ? {
            openingMarketHome: impliedHome,
            openingMarketDraw: 0,
            openingMarketAway: impliedAway,
            openingCapturedAt: new Date(),
          }
        : {};

    await prisma.match.update({
      where: { id: m.id },
      data: {
        marketHome: impliedHome,
        marketDraw: 0,
        marketAway: impliedAway,
        marketBookmakers: 1, // Cloudbet 또는 Pinnacle 단일 source
        marketUpdatedAt: new Date(),
        ...openingPatch,
        oddsHome: dh,
        oddsDraw: null,
        oddsAway: da,
      },
    });
    matched++;
  }
  console.log(
    `[odds/LOL] events=${events.length}, matched ${matched}/${dbMatches.length}`,
  );
  return matched;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchOdds()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
