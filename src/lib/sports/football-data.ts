// football-data.org API 클라이언트.
// - Base URL: https://api.football-data.org/v4
// - 인증 헤더: X-Auth-Token
// - 무료 플랜: 10 req/min, Tier 1 리그 접근 가능 (PL, BL1, PD, SA, FL1, CL 등)
// 문서: https://www.football-data.org/documentation/quickstart

import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE_URL = "https://api.football-data.org/v4";

// 매 호출마다 process.env 를 다시 읽도록 함수형으로 처리.
// (axios.create 의 module-level 캡처는 일부 실행 환경에서 빈 키가 박히는 사례 있음)
function getAuthHeader() {
  return { "X-Auth-Token": process.env.FOOTBALL_DATA_KEY ?? "" };
}

// 리그 코드 매핑 — football-data.org 의 competition code
const LEAGUE_CODES = {
  EPL: "PL", // Premier League
} as const;

interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED, LIVE, IN_PLAY, PAUSED, FINISHED, POSTPONED, ...
  matchday?: number;
  homeTeam: { id: number; name: string; shortName?: string; tla?: string; crest?: string };
  awayTeam: { id: number; name: string; shortName?: string; tla?: string; crest?: string };
  score?: {
    fullTime?: { home: number | null; away: number | null };
    halfTime?: { home: number | null; away: number | null };
  };
  competition?: { code?: string; name?: string };
  season?: { id: number; startDate: string; endDate: string; currentMatchday: number };
}

function mapStatus(s: string): MatchStatus {
  const u = (s ?? "").toUpperCase();
  if (u === "FINISHED" || u === "AWARDED") return "FINISHED";
  if (u === "POSTPONED" || u === "CANCELLED" || u === "SUSPENDED")
    return "POSTPONED";
  if (u === "LIVE" || u === "IN_PLAY" || u === "PAUSED") return "LIVE";
  return "SCHEDULED";
}

/** 시즌 범위(또는 임의 범위) 한 번에 가져오기. dateFrom/dateTo: YYYY-MM-DD */
export async function fetchEplRange(
  dateFrom: string,
  dateTo: string,
): Promise<NormalizedMatch[]> {
  if (!process.env.FOOTBALL_DATA_KEY) {
    throw new Error("FOOTBALL_DATA_KEY 가 설정되지 않았습니다.");
  }
  const { data } = await axios.get(
    `${BASE_URL}/competitions/${LEAGUE_CODES.EPL}/matches`,
    {
      headers: getAuthHeader(),
      params: { dateFrom, dateTo },
      timeout: 30000,
    },
  );
  const matches = (data?.matches ?? []) as FdMatch[];
  return matches.map((m): NormalizedMatch => ({
    league: "EPL",
    externalId: String(m.id),
    homeTeam: {
      externalId: String(m.homeTeam.id),
      name: m.homeTeam.shortName ?? m.homeTeam.name,
      shortName: m.homeTeam.tla,
      logoUrl: m.homeTeam.crest,
    },
    awayTeam: {
      externalId: String(m.awayTeam.id),
      name: m.awayTeam.shortName ?? m.awayTeam.name,
      shortName: m.awayTeam.tla,
      logoUrl: m.awayTeam.crest,
    },
    homeScore: m.score?.fullTime?.home ?? undefined,
    awayScore: m.score?.fullTime?.away ?? undefined,
    status: mapStatus(m.status),
    startTime: new Date(m.utcDate),
    raw: m,
  }));
}

export const eplCollectorViaFootballData: MatchCollector = {
  league: "EPL",

  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    if (!process.env.FOOTBALL_DATA_KEY) {
      throw new Error(
        "FOOTBALL_DATA_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.",
      );
    }

    // dateFrom / dateTo 둘 다 같은 날짜로 주면 그 하루 경기만 반환
    const { data } = await axios.get(
      `${BASE_URL}/competitions/${LEAGUE_CODES.EPL}/matches`,
      {
        headers: getAuthHeader(),
        params: { dateFrom: date, dateTo: date },
        timeout: 15000,
      },
    );

    const matches = (data?.matches ?? []) as FdMatch[];

    return matches.map((m): NormalizedMatch => ({
      league: "EPL",
      externalId: String(m.id),
      homeTeam: {
        externalId: String(m.homeTeam.id),
        name: m.homeTeam.shortName ?? m.homeTeam.name,
        shortName: m.homeTeam.tla,
        logoUrl: m.homeTeam.crest,
      },
      awayTeam: {
        externalId: String(m.awayTeam.id),
        name: m.awayTeam.shortName ?? m.awayTeam.name,
        shortName: m.awayTeam.tla,
        logoUrl: m.awayTeam.crest,
      },
      homeScore: m.score?.fullTime?.home ?? undefined,
      awayScore: m.score?.fullTime?.away ?? undefined,
      status: mapStatus(m.status),
      startTime: new Date(m.utcDate),
      raw: m,
    }));
  },
};
