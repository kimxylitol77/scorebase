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
  americanToDecimal,
} from "@/lib/sports/pinnacle";
import {
  fetchCloudbetLolCompetitions,
  fetchCloudbetLckEvents,
  isCloudbetEnabled,
} from "@/lib/sports/cloudbet";
import {
  fetchLolFixtures,
  fetchLolFixtureOdds,
  isOddsPapiEnabled,
} from "@/lib/sports/oddspapi";

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
    .replace(/\b(esports|e\s*sports|gaming|club|team|rolster|life|redforce|hangame|kia)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

// LCK 팀 영문 alias — DB Team.externalId(BDL id) → odds source 가 부르는 영문 패턴들
// OddsPapi/Pinnacle/Cloudbet 등 source 다 다른 표기 가능.
const LCK_TEAM_ALIASES: Record<string, string[]> = {
  "1": ["t1"],
  "2": ["geng", "gen.g", "genesports", "gengesports"],
  "7": ["hanwhalife", "hanwhalifeesports", "hle"],
  "8": ["ktrolster", "kt"],
  "21": ["dplus", "dpluskia", "dk", "damwon", "damwonkia"],
  "35": ["fearx", "bnkfearx", "bfx"],
  "62": ["nongshim", "nongshimredforce", "ns", "redforce"],
  "66": ["okbrion", "oksavingsbankbrion", "hanjinbrion", "bro", "brion"],
  "320": ["soopers", "dnsoopers", "dnfreecs", "freecs", "dns"],
  "321": ["drx"],
};

/** odds source 의 영문 매치명 → BDL externalId 추론 */
function bdlIdFromOddsName(name: string): string | null {
  const n = normLolName(name);
  for (const [bdlId, aliases] of Object.entries(LCK_TEAM_ALIASES)) {
    if (aliases.some((a) => n.includes(a) || a.includes(n))) return bdlId;
  }
  return null;
}

interface LolEventOdds {
  homeName: string;
  awayName: string;
  homeDecimal: number;
  awayDecimal: number;
  /** Total Maps OU (Bo3 게임 수 OU, 보통 line=2.5) */
  totalMaps?: {
    line: number;
    overDecimal: number;
    underDecimal: number;
  };
  sample: number; // 평균에 들어간 북메이커 수
  source: "oddspapi" | "cloudbet" | "pinnacle";
}

async function fetchLolEventOdds(): Promise<LolEventOdds[]> {
  const out: LolEventOdds[] = [];

  // 1) OddsPapi primary (LCK 공식 cover, 4 북메이커 평균)
  if (isOddsPapiEnabled()) {
    try {
      const fixtures = await fetchLolFixtures();
      console.log(`[odds/LOL] OddsPapi LCK fixtures ${fixtures.length}건`);
      for (const fx of fixtures) {
        const odds = await fetchLolFixtureOdds(fx.fixtureId);
        if (!odds?.matchWinner) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        out.push({
          homeName: fx.homeName,
          awayName: fx.awayName,
          homeDecimal: odds.matchWinner.homeDecimal,
          awayDecimal: odds.matchWinner.awayDecimal,
          totalMaps: odds.totalMaps
            ? {
                line: odds.totalMaps.line,
                overDecimal: odds.totalMaps.overDecimal,
                underDecimal: odds.totalMaps.underDecimal,
              }
            : undefined,
          sample: odds.matchWinner.sample,
          source: "oddspapi",
        });
        await new Promise((r) => setTimeout(r, 1000)); // rate limit 안전 (1 req/s)
      }
    } catch (err) {
      console.warn(`[odds/LOL] OddsPapi 실패:`, (err as Error).message);
    }
  }

  // 2) Cloudbet secondary (key 있을 때, OddsPapi 빈 응답이면)
  if (out.length === 0 && isCloudbetEnabled()) {
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
            sample: 1,
            source: "cloudbet",
          });
        }
        console.log(`[odds/LOL] Cloudbet ${events.length}건`);
      }
    } catch (err) {
      console.warn(`[odds/LOL] Cloudbet 실패:`, (err as Error).message);
    }
  }

  // 3) Pinnacle fallback (둘 다 빈 경우)
  if (out.length === 0) {
    try {
      const matches = await fetchPinnacleLolMatches();
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
          sample: 1,
          source: "pinnacle",
        });
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
    // BDL externalId 기반 alias 매칭 — 가장 정확 (영문/한글 양방향 호환)
    const homeBdl = m.homeTeam.externalId;
    const awayBdl = m.awayTeam.externalId;
    const ev = events.find((e) => {
      const evHomeBdl = bdlIdFromOddsName(e.homeName);
      const evAwayBdl = bdlIdFromOddsName(e.awayName);
      const direct =
        evHomeBdl === homeBdl && evAwayBdl === awayBdl;
      const swap =
        evHomeBdl === awayBdl && evAwayBdl === homeBdl;
      return direct || swap;
    });
    if (!ev) continue;

    // home/away 정렬 — odds source 의 home 이 우리 DB 의 home 과 같은가?
    const evHomeBdl = bdlIdFromOddsName(ev.homeName);
    const aligned = evHomeBdl === homeBdl;
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

    // Total Maps OU (Bo3 게임 수) — oddsTotalLine/oddsOver/oddsUnder 필드 재활용
    const totalMapsPatch = ev.totalMaps
      ? {
          oddsTotalLine: ev.totalMaps.line,
          oddsOver: ev.totalMaps.overDecimal,
          oddsUnder: ev.totalMaps.underDecimal,
        }
      : {};

    await prisma.match.update({
      where: { id: m.id },
      data: {
        marketHome: impliedHome,
        marketDraw: 0,
        marketAway: impliedAway,
        marketBookmakers: ev.sample,
        marketUpdatedAt: new Date(),
        ...openingPatch,
        oddsHome: dh,
        oddsDraw: null,
        oddsAway: da,
        ...totalMapsPatch,
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
