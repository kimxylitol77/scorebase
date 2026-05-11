// OddsPapi.io v4 — LoL/LCK odds (primary source).
// 문서: https://oddspapi.io/us/docs
// 인증: query parameter `apiKey={KEY}`. 환경변수 ODDSPAPI_KEY.
// LCK 공식 cover 확인됨. 4 핵심 북메이커 평균으로 vig 제거 implied prob.

import axios from "axios";

const BASE = "https://api.oddspapi.io/v4";
const SPORT_ID_LOL = 18;

const PREFERRED_BOOKMAKERS = ["pinnacle", "betway", "gg.bet", "thunderpick"];

// LoL Market IDs (cheatsheet 기준)
const MARKET = {
  WINNER_T1: 171,
  WINNER_T2: 172,
  TOTAL_MAPS_OVER: 1737,
  TOTAL_MAPS_UNDER: 1738,
} as const;

function apiKey(): string | null {
  return process.env.ODDSPAPI_KEY ?? null;
}

export function isOddsPapiEnabled(): boolean {
  return Boolean(apiKey());
}

interface OpFixture {
  fixtureId: number;
  sportId: number;
  participant1Id?: number;
  participant1Name?: string;
  participant2Id?: number;
  participant2Name?: string;
  startTime?: string;
  tournamentName?: string;
  hasOdds?: boolean;
  // 응답에 따라 nested team objects 일 수도 있어 유연하게
  participants?: Array<{ id: number; name: string }>;
}

interface OpOddsBookmaker {
  bookmaker: string;
  markets?: Array<{
    marketId: number;
    marketName?: string;
    outcomes?: Array<{
      outcomeId?: number;
      price?: number; // decimal
      decimalOdds?: number;
      line?: number; // OU 의 기준선 (Total Maps 2.5 등)
    }>;
  }>;
}

interface OpOddsResp {
  fixtureId?: number;
  bookmakerOdds?: OpOddsBookmaker[];
  bookmakers?: OpOddsBookmaker[]; // 응답 형식 variant
}

/* ---------------------------------------------------------------------
 * Fixtures — 향후 LCK 매치
 * -------------------------------------------------------------------*/

export interface LolFixture {
  fixtureId: number;
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

  const today = new Date();
  const from =
    opts?.from ?? today.toISOString().slice(0, 10);
  const to =
    opts?.to ??
    new Date(today.getTime() + 14 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

  try {
    const { data } = await axios.get<{ fixtures?: OpFixture[]; data?: OpFixture[] }>(
      `${BASE}/fixtures`,
      {
        params: {
          sportId: SPORT_ID_LOL,
          from,
          to,
          hasOdds: true,
          apiKey: key,
        },
        timeout: 12000,
      },
    );
    const rows = data.fixtures ?? data.data ?? [];
    return rows
      .map((f): LolFixture | null => {
        const home =
          f.participant1Name ??
          f.participants?.[0]?.name ??
          "";
        const away =
          f.participant2Name ??
          f.participants?.[1]?.name ??
          "";
        const tournament = f.tournamentName ?? "";
        // LCK 만 필터 (포괄적으로 — Korea / LCK 다 잡음)
        if (!/lck|korea/i.test(tournament)) return null;
        if (!home || !away) return null;
        return {
          fixtureId: f.fixtureId,
          homeName: home,
          awayName: away,
          startTime: f.startTime ?? "",
          tournamentName: tournament,
        };
      })
      .filter((f): f is LolFixture => f !== null);
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------
 * Odds — 한 매치의 4 핵심 북메이커 평균 → vig 제거 implied
 * -------------------------------------------------------------------*/

export interface LolFixtureOdds {
  fixtureId: number;
  // 시리즈 승자 (1X2 — LoL 무승부 X)
  matchWinner: {
    homeDecimal: number; // 4 북메이커 평균
    awayDecimal: number;
    homeImplied: number; // vig 제거
    awayImplied: number;
    sample: number; // 평균에 들어간 북메이커 수
  } | null;
  // Total Maps OVER/UNDER (Bo3 게임 수 OU)
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
  fixtureId: number,
): Promise<LolFixtureOdds | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const { data } = await axios.get<OpOddsResp>(`${BASE}/odds`, {
      params: { fixtureId, apiKey: key },
      timeout: 12000,
    });
    const books = data.bookmakerOdds ?? data.bookmakers ?? [];
    const preferred = books.filter((b) =>
      PREFERRED_BOOKMAKERS.includes(b.bookmaker?.toLowerCase()),
    );
    // 핵심 4 북메이커 없으면 전체 책 사용
    const pool = preferred.length > 0 ? preferred : books;

    // 시리즈 승자 — market 171/172
    const homeWinners: number[] = [];
    const awayWinners: number[] = [];
    for (const b of pool) {
      const t1 = b.markets?.find((m) => m.marketId === MARKET.WINNER_T1);
      const t2 = b.markets?.find((m) => m.marketId === MARKET.WINNER_T2);
      const hp = t1?.outcomes?.[0]?.decimalOdds ?? t1?.outcomes?.[0]?.price;
      const ap = t2?.outcomes?.[0]?.decimalOdds ?? t2?.outcomes?.[0]?.price;
      if (hp && ap) {
        homeWinners.push(hp);
        awayWinners.push(ap);
      }
    }
    let matchWinner: LolFixtureOdds["matchWinner"] = null;
    if (homeWinners.length > 0) {
      const hAvg = average(homeWinners);
      const aAvg = average(awayWinners);
      const implied = vigFreeBinary(hAvg, aAvg);
      matchWinner = {
        homeDecimal: hAvg,
        awayDecimal: aAvg,
        homeImplied: implied.home,
        awayImplied: implied.away,
        sample: homeWinners.length,
      };
    }

    // Total Maps OVER/UNDER — market 1737/1738
    const overByLine = new Map<number, number[]>();
    const underByLine = new Map<number, number[]>();
    for (const b of pool) {
      const ov = b.markets?.find((m) => m.marketId === MARKET.TOTAL_MAPS_OVER);
      const un = b.markets?.find((m) => m.marketId === MARKET.TOTAL_MAPS_UNDER);
      const ovOut = ov?.outcomes?.[0];
      const unOut = un?.outcomes?.[0];
      const ovLine = ovOut?.line ?? 2.5;
      const unLine = unOut?.line ?? ovLine;
      const ovPrice = ovOut?.decimalOdds ?? ovOut?.price;
      const unPrice = unOut?.decimalOdds ?? unOut?.price;
      if (ovPrice) {
        const arr = overByLine.get(ovLine) ?? [];
        arr.push(ovPrice);
        overByLine.set(ovLine, arr);
      }
      if (unPrice) {
        const arr = underByLine.get(unLine) ?? [];
        arr.push(unPrice);
        underByLine.set(unLine, arr);
      }
    }
    // 가장 흔한 line (보통 Bo3 는 2.5)
    let totalMaps: LolFixtureOdds["totalMaps"] = null;
    let bestLine: number | null = null;
    let bestSample = 0;
    for (const [line, arr] of overByLine.entries()) {
      if (arr.length > bestSample && underByLine.has(line)) {
        bestSample = arr.length;
        bestLine = line;
      }
    }
    if (bestLine != null) {
      const ovAvg = average(overByLine.get(bestLine)!);
      const unAvg = average(underByLine.get(bestLine)!);
      const implied = vigFreeBinary(ovAvg, unAvg);
      totalMaps = {
        line: bestLine,
        overDecimal: ovAvg,
        underDecimal: unAvg,
        overImplied: implied.home, // 'home' field = OVER
        underImplied: implied.away, // 'away' field = UNDER
        sample: bestSample,
      };
    }

    return { fixtureId, matchWinner, totalMaps };
  } catch {
    return null;
  }
}

/** 매치 매칭에 쓸 normalized 팀명. */
export function normLolName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(esports|e\s*sports|gaming|club|team|rolster|life)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
