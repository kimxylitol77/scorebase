// OddsPapi.io v4 — LoL/LCK odds (primary source).
// 문서: https://oddspapi.io/us/docs
// 인증: query parameter `apiKey={KEY}`. 환경변수 ODDSPAPI_KEY.

import axios from "axios";

const BASE = "https://api.oddspapi.io/v4";
const SPORT_ID_LOL = 18;

const PREFERRED_BOOKMAKERS = ["pinnacle", "betway", "gg.bet", "thunderpick"];

function apiKey(): string | null {
  return process.env.ODDSPAPI_KEY ?? null;
}

export function isOddsPapiEnabled(): boolean {
  return Boolean(apiKey());
}

/* =====================================================================
 * marketName → marketId set 캐싱
 * LoL 마켓이 너무 많아 (32k+) marketId 가 베팅사·line 별로 흩어져 있음.
 * marketName 기준으로 set 만들어 응답 파싱 시 분류.
 * ===================================================================*/

interface MarketDef {
  marketId: number;
  marketName: string;
  outcomes?: Array<{ outcomeId: number; outcomeName: string }>;
}

interface MarketCache {
  winnerIds: Set<number>; // "Winner" 또는 "Match Winner" 마켓
  totalMapsIds: Set<number>; // "Total Maps Over Under"
  mapsHandicapIds: Set<number>; // "Maps Handicap"
  firstMapWinnerIds: Set<number>; // "First Map Winner"
  fetchedAt: number;
}

let cachedMarkets: MarketCache | null = null;
const MARKETS_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchMarketDefs(): Promise<MarketCache> {
  if (cachedMarkets && Date.now() - cachedMarkets.fetchedAt < MARKETS_TTL_MS) {
    return cachedMarkets;
  }
  const key = apiKey();
  if (!key) {
    return {
      winnerIds: new Set(),
      totalMapsIds: new Set(),
      mapsHandicapIds: new Set(),
      firstMapWinnerIds: new Set(),
      fetchedAt: Date.now(),
    };
  }
  try {
    const { data } = await axios.get<MarketDef[]>(`${BASE}/markets`, {
      params: { sportId: SPORT_ID_LOL, apiKey: key },
      timeout: 15000,
    });
    const winner = new Set<number>();
    const totalMaps = new Set<number>();
    const mapsHc = new Set<number>();
    const firstMap = new Set<number>();
    for (const m of data) {
      const name = (m.marketName ?? "").toLowerCase();
      if (name === "winner" || name === "match winner") winner.add(m.marketId);
      else if (name === "total maps over under") totalMaps.add(m.marketId);
      else if (name === "maps handicap") mapsHc.add(m.marketId);
      else if (name.startsWith("first map winner")) firstMap.add(m.marketId);
    }
    cachedMarkets = {
      winnerIds: winner,
      totalMapsIds: totalMaps,
      mapsHandicapIds: mapsHc,
      firstMapWinnerIds: firstMap,
      fetchedAt: Date.now(),
    };
    return cachedMarkets;
  } catch {
    return {
      winnerIds: new Set(),
      totalMapsIds: new Set(),
      mapsHandicapIds: new Set(),
      firstMapWinnerIds: new Set(),
      fetchedAt: Date.now(),
    };
  }
}

/* =====================================================================
 * LCK tournament 동적 lookup
 * ===================================================================*/

interface OpTournament {
  tournamentId: number;
  tournamentSlug: string;
  tournamentName: string;
  futureFixtures?: number;
}

let cachedLckId: { id: number; fetchedAt: number } | null = null;
const TOURNAMENT_CACHE_MS = 6 * 60 * 60 * 1000;

export async function fetchLckTournamentId(): Promise<number | null> {
  const key = apiKey();
  if (!key) return null;
  if (cachedLckId && Date.now() - cachedLckId.fetchedAt < TOURNAMENT_CACHE_MS) {
    return cachedLckId.id;
  }
  try {
    const { data } = await axios.get<OpTournament[]>(`${BASE}/tournaments`, {
      params: { sportId: SPORT_ID_LOL, apiKey: key },
      timeout: 10000,
    });
    const lck =
      data.find((t) => t.tournamentSlug?.toLowerCase() === "lck") ??
      data.find((t) => /^lck$/i.test(t.tournamentName));
    if (!lck) return null;
    cachedLckId = { id: lck.tournamentId, fetchedAt: Date.now() };
    return lck.tournamentId;
  } catch {
    return null;
  }
}

/* =====================================================================
 * Fixtures
 * ===================================================================*/

interface OpFixture {
  fixtureId: number | string;
  sportId: number;
  participant1Id?: number;
  participant1Name?: string;
  participant2Id?: number;
  participant2Name?: string;
  startTime?: string;
  tournamentName?: string;
  hasOdds?: boolean;
}

export interface LolFixture {
  fixtureId: string;
  homeName: string;
  awayName: string;
  startTime: string;
  tournamentName: string;
}

export async function fetchLolFixtures(opts?: {
  from?: string;
  to?: string;
}): Promise<LolFixture[]> {
  const key = apiKey();
  if (!key) return [];

  const lckId = await fetchLckTournamentId();
  if (!lckId) return [];

  const today = new Date();
  const from = opts?.from ?? today.toISOString().slice(0, 10);
  const to =
    opts?.to ??
    new Date(today.getTime() + 21 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

  try {
    const { data } = await axios.get<OpFixture[]>(`${BASE}/fixtures`, {
      params: {
        tournamentId: lckId,
        from,
        to,
        hasOdds: true,
        apiKey: key,
      },
      timeout: 12000,
    });
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((f): LolFixture | null => {
        const home = f.participant1Name ?? "";
        const away = f.participant2Name ?? "";
        if (!home || !away) return null;
        return {
          fixtureId: String(f.fixtureId),
          homeName: home,
          awayName: away,
          startTime: f.startTime ?? "",
          tournamentName: f.tournamentName ?? "LCK",
        };
      })
      .filter((f): f is LolFixture => f !== null);
  } catch {
    return [];
  }
}

/* =====================================================================
 * Odds — 응답 구조: bookmakerOdds[bookmaker].markets[marketId].outcomes[outcomeId].players["0"].price
 * ===================================================================*/

interface OpOddsResp {
  fixtureId: string;
  participant1Id?: number;
  participant2Id?: number;
  bookmakerOdds?: Record<
    string,
    {
      bookmakerIsActive?: boolean;
      suspended?: boolean;
      markets?: Record<
        string,
        {
          marketActive?: boolean;
          outcomes?: Record<
            string,
            {
              players?: Record<
                string,
                {
                  active?: boolean;
                  price?: number;
                  priceAmerican?: string;
                  mainLine?: boolean;
                }
              >;
            }
          >;
        }
      >;
    }
  >;
}

export interface LolFixtureOdds {
  fixtureId: string;
  /** 시리즈 승자 (1X2, LoL 무승부 X) */
  matchWinner: {
    homeDecimal: number;
    awayDecimal: number;
    homeImplied: number; // vig 제거
    awayImplied: number;
    sample: number; // 평균에 들어간 북메이커 수
  } | null;
  /** Total Maps OU (Bo3 line=2.5 우선) */
  totalMaps: {
    line: number;
    overDecimal: number;
    underDecimal: number;
    overImplied: number;
    underImplied: number;
    sample: number;
  } | null;
}

function average(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
}

function vigFreeBinary(
  homeDec: number,
  awayDec: number,
): { home: number; away: number } {
  const pH = 1 / homeDec;
  const pA = 1 / awayDec;
  const sum = pH + pA;
  return { home: pH / sum, away: pA / sum };
}

export async function fetchLolFixtureOdds(
  fixtureId: string,
): Promise<LolFixtureOdds | null> {
  const key = apiKey();
  if (!key) return null;
  const defs = await fetchMarketDefs();

  try {
    const { data } = await axios.get<OpOddsResp>(`${BASE}/odds`, {
      params: { fixtureId, apiKey: key },
      timeout: 12000,
    });
    const bookmakers = data.bookmakerOdds ?? {};
    const preferred = Object.entries(bookmakers).filter(([name]) =>
      PREFERRED_BOOKMAKERS.includes(name.toLowerCase()),
    );
    const pool = preferred.length > 0 ? preferred : Object.entries(bookmakers);

    const winnerHome: number[] = [];
    const winnerAway: number[] = [];
    // totalMaps: 한 베팅사가 여러 line 갖고 있을 수 있어 outcomeId 첫 등장으로 어울리는 짝 찾기.
    // 가장 sample 많은 marketId 를 main line 으로 채택.
    const tmHomePool = new Map<number, number[]>(); // marketId → over prices
    const tmAwayPool = new Map<number, number[]>(); // marketId → under prices

    for (const [, bm] of pool) {
      if (bm.suspended) continue;
      for (const [mIdStr, m] of Object.entries(bm.markets ?? {})) {
        const mId = Number(mIdStr);
        const isWinner = defs.winnerIds.has(mId);
        const isTotal = defs.totalMapsIds.has(mId);
        if (!isWinner && !isTotal) continue;
        if (!m.marketActive) continue;
        const outcomes = m.outcomes ?? {};
        const outIds = Object.keys(outcomes).map(Number).sort((a, b) => a - b);
        if (outIds.length < 2) continue;
        const [first, second] = outIds;
        const pFirst =
          outcomes[String(first)]?.players?.["0"]?.price ??
          outcomes[first]?.players?.["0"]?.price;
        const pSecond =
          outcomes[String(second)]?.players?.["0"]?.price ??
          outcomes[second]?.players?.["0"]?.price;
        if (!pFirst || !pSecond) continue;

        if (isWinner) {
          // outcomeName "1" 가 home, "2" 가 away
          winnerHome.push(pFirst);
          winnerAway.push(pSecond);
        } else if (isTotal) {
          // outcomeName "Over" 가 home pool, "Under" 가 away pool
          const arrO = tmHomePool.get(mId) ?? [];
          arrO.push(pFirst);
          tmHomePool.set(mId, arrO);
          const arrU = tmAwayPool.get(mId) ?? [];
          arrU.push(pSecond);
          tmAwayPool.set(mId, arrU);
        }
      }
    }

    let matchWinner: LolFixtureOdds["matchWinner"] = null;
    if (winnerHome.length > 0) {
      const hAvg = average(winnerHome);
      const aAvg = average(winnerAway);
      const implied = vigFreeBinary(hAvg, aAvg);
      matchWinner = {
        homeDecimal: hAvg,
        awayDecimal: aAvg,
        homeImplied: implied.home,
        awayImplied: implied.away,
        sample: winnerHome.length,
      };
    }

    // Total Maps — 가장 많은 sample 가진 marketId 선택 (보통 2.5 line)
    let bestMarketId: number | null = null;
    let bestSample = 0;
    for (const [mId, arr] of tmHomePool.entries()) {
      if (arr.length > bestSample && tmAwayPool.has(mId)) {
        bestSample = arr.length;
        bestMarketId = mId;
      }
    }
    let totalMaps: LolFixtureOdds["totalMaps"] = null;
    if (bestMarketId != null) {
      const oAvg = average(tmHomePool.get(bestMarketId)!);
      const uAvg = average(tmAwayPool.get(bestMarketId)!);
      const implied = vigFreeBinary(oAvg, uAvg);
      totalMaps = {
        // line 은 marketId 로 알 수 없어 일단 2.5 default (Bo3 mainstream).
        // 정확한 line 은 /markets 응답에 lineValue 필드 있으면 보강 가능.
        line: 2.5,
        overDecimal: oAvg,
        underDecimal: uAvg,
        overImplied: implied.home,
        underImplied: implied.away,
        sample: bestSample,
      };
    }

    return {
      fixtureId,
      matchWinner,
      totalMaps,
    };
  } catch {
    return null;
  }
}

export function normLolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(esports|e\s*sports|gaming|club|team|rolster|life)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
