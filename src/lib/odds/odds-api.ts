// The Odds API 통합 — 베팅사이트 1X2 odds 가져와서 우리 모델과 cross-check.
// https://the-odds-api.com (Free 500 req/월, Basic $30/월 20k req/월)

import axios from "axios";

const BASE = "https://api.the-odds-api.com/v4";

// 우리 League 코드 → Odds API sport key 매핑.
// AFC_CL 은 The Odds API 가 미지원 → 라이브 odds 미제공.
export const SPORT_KEY: Record<string, string> = {
  EPL: "soccer_epl",
  LALIGA: "soccer_spain_la_liga",
  BUNDESLIGA: "soccer_germany_bundesliga",
  SERIE_A: "soccer_italy_serie_a",
  LIGUE_1: "soccer_france_ligue_one",
  MLS: "soccer_usa_mls",
  UCL: "soccer_uefa_champs_league",
  J1_LEAGUE: "soccer_japan_j_league",
  NBA: "basketball_nba",
  WNBA: "basketball_wnba", // 2026-07 추가 — 시즌 4~9월, The Odds API active 확인
  NHL: "icehockey_nhl",
  MLB: "baseball_mlb",
  // KBO/NPB — The Odds API 무료 plan 에서도 active=true 확인 (2026-05).
  KBO: "baseball_kbo",
  NPB: "baseball_npb",
  // 2026-05-24 추가 — /v4/sports?all=true 로 검증된 active soccer 23개
  EREDIVISIE: "soccer_netherlands_eredivisie",
  SPL: "soccer_spl",
  UECL: "soccer_uefa_europa_conference_league",
  WORLD_CUP: "soccer_fifa_world_cup",
  // 유럽 2부
  // 2026-07-10 교정 — The Odds 가 키를 soccer_england_championship → soccer_efl_champ 로 변경, stale 로 배당 미수집이었음.
  CHAMPIONSHIP: "soccer_efl_champ",
  LEAGUE_ONE: "soccer_england_league1",
  LEAGUE_TWO: "soccer_england_league2",
  BUNDESLIGA_2: "soccer_germany_bundesliga2",
  SERIE_B: "soccer_italy_serie_b",
  LALIGA_2: "soccer_spain_segunda_division",
  // 유럽 기타 1부
  AUSTRIA_BL: "soccer_austria_bundesliga",
  JUPILER_PL: "soccer_belgium_first_div",
  IRELAND_PD: "soccer_league_of_ireland",
  // 북유럽
  ELITESERIEN: "soccer_norway_eliteserien",
  ALLSVENSKAN: "soccer_sweden_allsvenskan",
  SUPERETTAN: "soccer_sweden_superettan",
  VEIKKAUSLIIGA: "soccer_finland_veikkausliiga",
  // 남미 + 멕시코
  ARGENTINA_PL: "soccer_argentina_primera_division",
  BRASILEIRAO: "soccer_brazil_campeonato",
  BRASILEIRAO_2: "soccer_brazil_serie_b",
  CHILE_PD: "soccer_chile_campeonato",
  LIGA_MX: "soccer_mexico_ligamx",
  COPA_LIB: "soccer_conmebol_copa_libertadores",
  COPA_SUD: "soccer_conmebol_copa_sudamericana",
  // 아시아
  CSL: "soccer_china_superleague",
  // 2026-07-10 추가 — 우리 커버 리그 ∩ The Odds 제공(all=true 검증) 신규 매핑
  K_LEAGUE_1: "soccer_korea_kleague1",
  SUPER_LIG: "soccer_turkey_super_league",
  PRIMEIRA_LIGA: "soccer_portugal_primeira_liga",
  RPL: "soccer_russia_premier_league",
  SAUDI_PL: "soccer_saudi_arabia_pro_league",
  GREEK_SL: "soccer_greece_super_league",
  DENMARK_SL: "soccer_denmark_superliga",
  SWISS_SL: "soccer_switzerland_superleague",
  EKSTRAKLASA: "soccer_poland_ekstraklasa",
  LIGUE_2: "soccer_france_ligue_two",
  A_LEAGUE: "soccer_australia_aleague",
  // 국가대표 / 대륙 대회
  UEL: "soccer_uefa_europa_league",
  UEFA_NL: "soccer_uefa_nations_league",
  EURO_QUAL: "soccer_uefa_euro_qualification",
  CLUB_WORLD_CUP: "soccer_fifa_club_world_cup",
  AFCON: "soccer_africa_cup_of_nations",
  CONCACAF_GOLD: "soccer_concacaf_gold_cup",
  // 컵 대회
  FA_CUP: "soccer_fa_cup",
  EFL_CUP: "soccer_england_efl_cup",
  COPA_DEL_REY: "soccer_spain_copa_del_rey",
  COPPA_ITALIA: "soccer_italy_coppa_italia",
  DFB_POKAL: "soccer_germany_dfb_pokal",
  COUPE_DE_FRANCE: "soccer_france_coupe_de_france",
};

interface OddsApiOutcome {
  name: string;
  price: number; // decimal odds (e.g. 2.10)
  point?: number; // totals/spreads 기준선 (h2h 는 없음)
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
        // 축구는 eu 단일(유럽 대형 북메이커 다수로 컨센서스 충분) → 호출당 credit 3(=1×markets).
        // 미국계(야구/농구/하키)는 us 라인이 핵심이라 uk,eu,us 유지. 2026-07-10 quota 절감.
        regions: opts?.regions ?? (sportKey.startsWith("soccer_") ? "eu" : "uk,eu,us"),
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

/** 정규화 후 문자열 별칭 — 소스가 아예 다른 이름을 쓰는 팀 (부분일치로 못 잇는 케이스).
 *  김천 상무: The Odds API 가 연고 이전 전 옛 이름 "Sangju Sangmu"(상주 상무)로 보낸다
 *  (2026-08-16 실측 — K리그 배당이 한 경기만 붙던 원인 중 하나). */
const NORMALIZED_TEAM_ALIAS: Record<string, string> = {
  sangjusangmu: "gimcheonsangmu",
};

/** 팀 이름 매칭용 — football-data/ESPN/Odds API 사이의 표기 차이 흡수.
 *  hyundai 도 제거 — "Jeonbuk Hyundai Motors" ↔ 우리 "Jeonbuk Motors" 는 단어가 중간에
 *  끼어 부분일치가 깨진다 ("울산 HD" ↔ "Ulsan Hyundai FC" 도 동일 계열). */
export function normalizeOddsTeamName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/\b(fc|afc|cf|club|hotspur|wanderers|the|hyundai)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
  return NORMALIZED_TEAM_ALIAS[n] ?? n;
}

export const ODDS_SUPPORTED_LEAGUES = Object.keys(SPORT_KEY);
