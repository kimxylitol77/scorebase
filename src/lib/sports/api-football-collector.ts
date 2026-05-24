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
  // 유럽 8월~5월 시즌 (1부 + 2부 + 컵 + 사우디 + 호주 A-리그 + 멕시코 Liga MX + AFC 챔스 Elite/Two)
  // AFC_CL Elite: 2025 시즌 = 2025-08-12 ~ 2026-04-25 (유럽 스타일로 운영)
  const european: League[] = [
    "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL",
    "UEL", "UECL",
    "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
    "SAUDI_PL",
    "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
    "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I", "SWISS_SL", "CHALLENGE_LEAGUE", "ARMENIA_PL",
    "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
    "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
    "BOSNIA_PL", "ALBANIA_SL", "MOLDOVA_SL", // Tier 3 (아일랜드는 봄~가을 → default 분기로 처리)
    "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL", "INDONESIA_L1",
    "UAE_PL", "QATAR_SL", "MOROCCO_BP", "SOUTHAFRICA_PSL", // 아시아·중동·아프리카 (8~5월)
    "SINGAPORE_PL", // API가 시즌을 시작 연도로 표기 (3월~10월 시즌인데 "2025" 표기)
    "A_LEAGUE", "LIGA_MX", "AFC_CL", "AFC_CL_TWO",
    // 신규 — 유럽 시즌 (8~5월)
    "THAI_L1", "WSL", "UEFA_WCL", "A_LEAGUE_W", "UEFA_NL", "EURO_QUAL",
    // 2026-05-24 추가 — 유럽 8~5월 시즌
    "SUI_CUP", "LEAGUE_ONE",
    // 2026-05-24 (2차) — 유럽 8~5월 시즌
    "AZERBAIJAN_PL", "EREDIVISIE_2", "PRIMEIRA_LIGA_2",
    // 2026-05-24 (3차) — 8~5월 시즌. ARG_PRIMERA_NACIONAL/SVENSKA_CUPEN 은 달력연도라 default 분기 사용
    "LEAGUE_TWO", "NATIONAL_LEAGUE",
    "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
    "RPL", "ALGERIA_L1", "GHANA_PL",
  ];
  if ((european as readonly string[]).includes(league)) {
    return month >= 7 ? year : year - 1;
  }
  if (league === "WORLD_CUP") return 2026;
  if (league === "CLUB_WORLD_CUP") return 2025; // 다음 대회 시작 시 업데이트
  if (league === "AFC_U23") return 2025; // 다음 대회 ~2027
  // 토너 단발성 — 매년/격년 업데이트
  if (league === "AFCON") return 2025;
  if (league === "CONCACAF_GOLD") return 2025;
  if (league === "U20_WC") return 2025;
  if (league === "U17_WC") return 2025;
  if (league === "OLYMPICS_FOOTBALL") return 2024;
  // 다년 예선 — 현재 cycle (2026 WC, 2028 Euro)
  if (league === "WC_QUAL") return 2026;
  return year; // K1/K2/K3/K4, J1/J2/J3, MLS, BRASILEIRAO, COPA_LIB/SUD, CSL,
                // NWSL, WK_LEAGUE, VIETNAM_VL2, ARGENTINA_PL, URUGUAY/PARAGUAY/BOLIVIA_PD,
                // INTL_FRIENDLY 등 달력 연도
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
