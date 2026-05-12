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
  // KBO/NPB — The Odds API 무료 plan 에서도 active=true 확인 (2026-05).
  KBO: "baseball_kbo",
  NPB: "baseball_npb",
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

/** 한 리그의 향후 매치 odds. markets 옵션으로 h2h / totals / spreads 선택 */
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
  const { data, headers } = await axios.get<OddsApiEvent[]>(
    `${BASE}/sports/${sportKey}/odds`,
    {
      params: {
        apiKey,
        regions: opts?.regions ?? "uk,eu,us",
        // h2h(1X2) + totals(O/U) + spreads(HC) — 무료/Standard plan 지원.
        // btts, double_chance 는 Pro plan ($99/월~) 추가 markets — 추후 결제 시 markets에 추가
        markets: opts?.markets ?? "h2h,totals,spreads",
        oddsFormat: "decimal",
      },
      timeout: 20000,
      validateStatus: (s) => s < 500,
    },
  );
  // The Odds API 한도 헤더 로그 (자동 감시용)
  if (headers["x-requests-remaining"]) {
    console.log(
      `[odds-api/${league}] quota remaining: ${headers["x-requests-remaining"]} / used: ${headers["x-requests-used"] ?? "?"}`,
    );
  }
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

/** OVER/UNDER 평균 — bookmaker 별 totals 마켓 평균 */
export function averageTotals(event: OddsApiEvent): {
  line: number;
  over: number;
  under: number;
  bookmakers: number;
} | null {
  // 가장 흔한 line 선택 (vote)
  const lineVotes = new Map<number, number>();
  for (const b of event.bookmakers) {
    const tot = b.markets.find((m) => m.key === "totals");
    if (!tot) continue;
    const overOut = tot.outcomes.find((o) => o.name === "Over");
    if (!overOut) continue;
    const line = (overOut as OddsApiOutcome & { point?: number }).point;
    if (line == null) continue;
    lineVotes.set(line, (lineVotes.get(line) ?? 0) + 1);
  }
  if (lineVotes.size === 0) return null;
  const [bestLine] = [...lineVotes.entries()].sort((a, b) => b[1] - a[1])[0];

  let overSum = 0,
    underSum = 0,
    n = 0;
  for (const b of event.bookmakers) {
    const tot = b.markets.find((m) => m.key === "totals");
    if (!tot) continue;
    const o = tot.outcomes.find(
      (x) => x.name === "Over" && (x as OddsApiOutcome & { point?: number }).point === bestLine,
    );
    const u = tot.outcomes.find(
      (x) => x.name === "Under" && (x as OddsApiOutcome & { point?: number }).point === bestLine,
    );
    if (o && u) {
      overSum += o.price;
      underSum += u.price;
      n++;
    }
  }
  if (n === 0) return null;
  return { line: bestLine, over: overSum / n, under: underSum / n, bookmakers: n };
}

/** 핸디캡(spreads) 평균 — 강팀(line < 0) 입장에서 abs(line) 표시 */
export function averageSpread(event: OddsApiEvent): {
  line: number; // 강팀 핸디캡 절대값 (예: -1.5 → 1.5)
  pick: "HOME" | "AWAY";
  homeOdds: number;
  awayOdds: number;
  bookmakers: number;
} | null {
  // 강팀 = home_team의 spread가 음수인 경우. line vote.
  const lineVotes = new Map<string, number>(); // key = `${pick}|${absLine}`
  for (const b of event.bookmakers) {
    const sp = b.markets.find((m) => m.key === "spreads");
    if (!sp) continue;
    const homeOut = sp.outcomes.find((o) => o.name === event.home_team) as
      | (OddsApiOutcome & { point?: number })
      | undefined;
    if (!homeOut || homeOut.point == null) continue;
    const pick: "HOME" | "AWAY" = homeOut.point < 0 ? "HOME" : "AWAY";
    const absLine = Math.abs(homeOut.point);
    const key = `${pick}|${absLine}`;
    lineVotes.set(key, (lineVotes.get(key) ?? 0) + 1);
  }
  if (lineVotes.size === 0) return null;
  const [bestKey] = [...lineVotes.entries()].sort((a, b) => b[1] - a[1])[0];
  const [pickStr, absStr] = bestKey.split("|");
  const pick = pickStr as "HOME" | "AWAY";
  const absLine = Number(absStr);
  const targetHomePoint = pick === "HOME" ? -absLine : absLine;

  let homeSum = 0,
    awaySum = 0,
    n = 0;
  for (const b of event.bookmakers) {
    const sp = b.markets.find((m) => m.key === "spreads");
    if (!sp) continue;
    const ho = sp.outcomes.find(
      (o) =>
        o.name === event.home_team &&
        (o as OddsApiOutcome & { point?: number }).point === targetHomePoint,
    );
    const ao = sp.outcomes.find(
      (o) =>
        o.name === event.away_team &&
        (o as OddsApiOutcome & { point?: number }).point === -targetHomePoint,
    );
    if (ho && ao) {
      homeSum += ho.price;
      awaySum += ao.price;
      n++;
    }
  }
  if (n === 0) return null;
  return {
    line: absLine,
    pick,
    homeOdds: homeSum / n,
    awayOdds: awaySum / n,
    bookmakers: n,
  };
}

/** BTTS (Both Teams To Score) 평균 — Yes/No */
export function averageBtts(event: OddsApiEvent): {
  yes: number;
  no: number;
  bookmakers: number;
} | null {
  let yesSum = 0,
    noSum = 0,
    n = 0;
  for (const b of event.bookmakers) {
    const m = b.markets.find((x) => x.key === "btts");
    if (!m) continue;
    const y = m.outcomes.find((o) => o.name === "Yes");
    const no = m.outcomes.find((o) => o.name === "No");
    if (y && no) {
      yesSum += y.price;
      noSum += no.price;
      n++;
    }
  }
  if (n === 0) return null;
  return { yes: yesSum / n, no: noSum / n, bookmakers: n };
}

/** Double Chance 평균 — 1X / 12 / X2 */
export function averageDoubleChance(event: OddsApiEvent): {
  oneX: number; // home OR draw
  twelve: number; // home OR away
  xTwo: number; // draw OR away
  bookmakers: number;
} | null {
  let oneXSum = 0,
    twelveSum = 0,
    xTwoSum = 0,
    n = 0;
  for (const b of event.bookmakers) {
    const m = b.markets.find((x) => x.key === "double_chance");
    if (!m) continue;
    // outcome name 패턴: "Home Team or Draw" / "Home Team or Away Team" / "Draw or Away Team"
    let oneX: number | null = null;
    let twelve: number | null = null;
    let xTwo: number | null = null;
    for (const o of m.outcomes) {
      const lower = o.name.toLowerCase();
      const hasHome = lower.includes(event.home_team.toLowerCase());
      const hasAway = lower.includes(event.away_team.toLowerCase());
      const hasDraw = lower.includes("draw");
      if (hasHome && hasDraw) oneX = o.price;
      else if (hasHome && hasAway) twelve = o.price;
      else if (hasDraw && hasAway) xTwo = o.price;
    }
    if (oneX && twelve && xTwo) {
      oneXSum += oneX;
      twelveSum += twelve;
      xTwoSum += xTwo;
      n++;
    }
  }
  if (n === 0) return null;
  return {
    oneX: oneXSum / n,
    twelve: twelveSum / n,
    xTwo: xTwoSum / n,
    bookmakers: n,
  };
}

/** 1X2 raw decimal odds 평균 (vig 미제거) — UI 표시용 */
export function averageH2h(event: OddsApiEvent): {
  home: number;
  draw: number | null;
  away: number;
  bookmakers: number;
} | null {
  let homeSum = 0,
    drawSum = 0,
    awaySum = 0,
    n = 0,
    drawN = 0;
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
      homeSum += h;
      awaySum += a;
      n++;
      if (d) {
        drawSum += d;
        drawN++;
      }
    }
  }
  if (n === 0) return null;
  return {
    home: homeSum / n,
    draw: drawN > 0 ? drawSum / drawN : null,
    away: awaySum / n,
    bookmakers: n,
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
