// The Odds API 통합 — 베팅사이트 1X2 odds 가져와서 우리 모델과 cross-check.
// https://the-odds-api.com (Free 500 req/월, Basic $30/월 20k req/월)

import axios from "axios";

const BASE = "https://api.the-odds-api.com/v4";

// 우리 League 코드 → Odds API sport key 매핑
const SPORT_KEY: Record<string, string> = {
  EPL: "soccer_epl",
  LALIGA: "soccer_spain_la_liga",
  BUNDESLIGA: "soccer_germany_bundesliga",
  SERIE_A: "soccer_italy_serie_a",
  LIGUE_1: "soccer_france_ligue_one",
  MLS: "soccer_usa_mls",
  UCL: "soccer_uefa_champs_league",
  NBA: "basketball_nba",
  NHL: "icehockey_nhl",
  MLB: "baseball_mlb",
};

interface OddsApiOutcome {
  name: string;
  price: number; // decimal odds (e.g. 2.10)
}
interface OddsApiMarket {
  key: string; // "h2h" / "spreads" / "totals"
  outcomes: OddsApiOutcome[];
}
interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}
export interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

/** 한 리그의 향후 매치 odds. h2h(=1X2)만 우선 */
export async function fetchLeagueOdds(
  league: string,
  opts?: { regions?: string; markets?: string },
): Promise<OddsApiEvent[]> {
  const sportKey = SPORT_KEY[league];
  if (!sportKey) return [];
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    console.warn("[odds-api] ODDS_API_KEY 미설정");
    return [];
  }
  const { data } = await axios.get<OddsApiEvent[]>(`${BASE}/sports/${sportKey}/odds`, {
    params: {
      apiKey,
      regions: opts?.regions ?? "uk,eu,us",
      markets: opts?.markets ?? "h2h",
      oddsFormat: "decimal",
    },
    timeout: 20000,
    validateStatus: (s) => s < 500,
  });
  if (!Array.isArray(data)) return [];
  return data;
}

/**
 * 베팅사이트 odds 평균에서 implied probability 산출 (vig 제거).
 * h2h outcomes: home_team / draw / away_team (축구 3-way) 또는 home/away (2-way)
 */
export function impliedFromOdds(event: OddsApiEvent): {
  home: number;
  draw: number;
  away: number;
  consensus: number; // 통합한 bookmaker 수
} | null {
  let homeSum = 0,
    drawSum = 0,
    awaySum = 0,
    n = 0;
  for (const b of event.bookmakers) {
    const h2h = b.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;
    let h: number | null = null,
      d: number | null = null,
      a: number | null = null;
    for (const o of h2h.outcomes) {
      if (o.name === event.home_team) h = o.price;
      else if (o.name === event.away_team) a = o.price;
      else if (o.name === "Draw") d = o.price;
    }
    if (h && a) {
      // implied = 1/odds, 정규화 (vig 제거)
      const ih = 1 / h;
      const id = d ? 1 / d : 0;
      const ia = 1 / a;
      const sum = ih + id + ia;
      homeSum += ih / sum;
      drawSum += id / sum;
      awaySum += ia / sum;
      n++;
    }
  }
  if (n === 0) return null;
  return {
    home: homeSum / n,
    draw: drawSum / n,
    away: awaySum / n,
    consensus: n,
  };
}

/** 우리 model prob vs 시장 implied prob — value bet 판별 (model > market 면 value) */
export function valueGap(
  modelProb: number,
  marketProb: number,
): { gap: number; isValue: boolean } {
  return {
    gap: modelProb - marketProb,
    isValue: modelProb - marketProb >= 0.05, // 5%p 이상 차이
  };
}

/** 팀 이름 매칭용 — football-data/ESPN/Odds API 사이의 표기 차이 흡수 */
export function normalizeOddsTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(fc|afc|cf|club|hotspur|wanderers|the)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

export const ODDS_SUPPORTED_LEAGUES = Object.keys(SPORT_KEY);
