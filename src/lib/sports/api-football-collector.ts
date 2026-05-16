// Generic api-football fixture collector.
// ESPN 미커버 리그 (K리그 1·2 등) 용 — 일자별 fixtures + 매치 정규화.
// API_FOOTBALL_LEAGUE_ID 에 등록된 리그면 빌더로 즉시 collector 생성.

import axios from "axios";
import { API_FOOTBALL_LEAGUE_ID } from "./api-football-pro";
import type {
  League,
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE = "https://v3.football.api-sports.io";

function client() {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY 가 설정되지 않았습니다.");
  }
  return axios.create({
    baseURL: BASE,
    timeout: 20_000,
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
  });
}

function mapStatus(short: string): MatchStatus {
  if (["FT", "AET", "PEN"].includes(short)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short)) return "LIVE";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(short)) return "POSTPONED";
  return "SCHEDULED";
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  teams: {
    home: { id: number; name: string; logo?: string };
    away: { id: number; name: string; logo?: string };
  };
  goals: { home: number | null; away: number | null };
}

/** date 가 속한 시즌 연도 — 달력 연도 vs 유럽 7월~6월 vs 단일 토너먼트. */
function seasonFor(league: League, date: string): number {
  const year = parseInt(date.slice(0, 4));
  const month = parseInt(date.slice(5, 7));
  // 유럽 8월~5월 시즌 (1부 + 2부 + 컵 + 사우디 + 호주 A-리그 + 멕시코 Liga MX + AFC 챔스 Two)
  const european: League[] = [
    "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL",
    "UEL", "UECL",
    "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
    "SAUDI_PL",
    "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
    "A_LEAGUE", "LIGA_MX", "AFC_CL_TWO",
  ];
  if ((european as readonly string[]).includes(league)) {
    return month >= 7 ? year : year - 1;
  }
  if (league === "WORLD_CUP") return 2026;
  if (league === "CLUB_WORLD_CUP") return 2025; // 다음 대회 시작 시 업데이트
  if (league === "AFC_U23") return 2025; // 다음 대회 ~2027
  return year; // K1/K2, J1/J2, MLS, AFC_CL, BRASILEIRAO, COPA_LIB/SUD, CSL — 달력 연도
}

function toNormalized(league: League, f: ApiFixture): NormalizedMatch {
  return {
    league,
    externalId: String(f.fixture.id),
    homeTeam: {
      externalId: String(f.teams.home.id),
      name: f.teams.home.name,
      logoUrl: f.teams.home.logo,
    },
    awayTeam: {
      externalId: String(f.teams.away.id),
      name: f.teams.away.name,
      logoUrl: f.teams.away.logo,
    },
    homeScore: f.goals?.home ?? undefined,
    awayScore: f.goals?.away ?? undefined,
    status: mapStatus(f.fixture?.status?.short ?? ""),
    startTime: new Date(f.fixture.date),
    raw: f,
  };
}

/**
 * 일자별 fixtures fetch (KST date 기준 ±0일 — collector 호출자가 pastDays/futureDays 로 반복).
 */
export function buildApiFootballCollector(league: League): MatchCollector {
  const leagueId = API_FOOTBALL_LEAGUE_ID[league];
  if (!leagueId) {
    throw new Error(`api-football league id 미등록: ${league}`);
  }
  return {
    league,
    async fetchByDate(date: string): Promise<NormalizedMatch[]> {
      const season = seasonFor(league, date);
      const { data } = await client().get("/fixtures", {
        params: { league: leagueId, season, date },
      });
      const arr = (data?.response ?? []) as ApiFixture[];
      return arr.map((f) => toNormalized(league, f));
    },
  };
}
