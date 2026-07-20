// FIFA 월드컵 collector — api-football Pro 기반.
// 다른 클럽 리그와 달리 시즌이 단일 연도이고, 32개 국가대표 팀이
// 조별예선 → 토너먼트로 이어진다. league=1, season=2026 고정.

import axios from "axios";
import { afGoalsExcludingShootout } from "./api-football-pro";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE_URL = "https://v3.football.api-sports.io";
const WORLD_CUP_LEAGUE_ID = 1;
const WORLD_CUP_SEASON = 2026;

function client() {
  if (!process.env.API_FOOTBALL_KEY) {
    throw new Error("API_FOOTBALL_KEY 가 설정되지 않았습니다.");
  }
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
  });
}

function mapStatus(short: string): MatchStatus {
  if (["FT", "AET", "PEN"].includes(short)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short))
    return "LIVE";
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
  score?: {
    fulltime?: { home: number | null; away: number | null };
    extratime?: { home: number | null; away: number | null };
  };
}

function toNormalized(f: ApiFixture): NormalizedMatch {
  const g = afGoalsExcludingShootout(f.fixture?.status?.short, f.goals, f.score);
  return {
    league: "WORLD_CUP",
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
    homeScore: g.home ?? undefined,
    awayScore: g.away ?? undefined,
    status: mapStatus(f.fixture?.status?.short ?? ""),
    startTime: new Date(f.fixture.date),
    raw: f,
  };
}

/** 토너먼트 전체 fixture 한 번에. 호출 1회로 모든 매치(72~104) 획득. */
export async function fetchWorldCupAll(): Promise<NormalizedMatch[]> {
  const { data } = await client().get("/fixtures", {
    params: { league: WORLD_CUP_LEAGUE_ID, season: WORLD_CUP_SEASON },
  });
  const arr = (data?.response ?? []) as ApiFixture[];
  return arr.map(toNormalized);
}

/** 특정 날짜만 (다른 collector 와 인터페이스 통일). */
async function fetchByDate(date: string): Promise<NormalizedMatch[]> {
  const { data } = await client().get("/fixtures", {
    params: {
      league: WORLD_CUP_LEAGUE_ID,
      season: WORLD_CUP_SEASON,
      date,
    },
  });
  const arr = (data?.response ?? []) as ApiFixture[];
  return arr.map(toNormalized);
}

export const worldCupCollector: MatchCollector = {
  league: "WORLD_CUP",
  fetchByDate,
};
