// api-sports Baseball API 공통 클라이언트.
// - Base URL: https://v1.baseball.api-sports.io
// - 인증 헤더: x-apisports-key
// - 응답: { response: [...] }
//
// EPL 용 api-football 과 같은 회사/구조이며, baseball 은 fixtures 가 아니라
// /games endpoint 를 사용한다.

import axios from "axios";

const BASE_URL = "https://v1.baseball.api-sports.io";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "x-apisports-key": process.env.API_BASEBALL_KEY ?? "",
  },
});

export interface ApiBaseballGame {
  id: number;
  date: string; // ISO
  time?: string;
  timestamp?: number;
  timezone?: string;
  status: {
    long: string; // "Finished", "Not Started", "In Progress", "Postponed", ...
    short: string; // "FT", "NS", "IN1"~"IN9", "POST", ...
  };
  league?: {
    id: number;
    name: string;
    season: number | string;
    logo?: string;
  };
  teams: {
    home: { id: number; name: string; logo?: string };
    away: { id: number; name: string; logo?: string };
  };
  scores?: {
    home?: { total: number | null; innings?: Record<string, number | null> };
    away?: { total: number | null; innings?: Record<string, number | null> };
  };
}

interface ApiBaseballResponse<T> {
  get: string;
  parameters: Record<string, unknown>;
  errors: unknown;
  results: number;
  paging?: { current: number; total: number };
  response: T[];
}

export function isApiBaseballEnabled(): boolean {
  return Boolean(process.env.API_BASEBALL_KEY);
}

/**
 * 특정 리그·시즌의 경기 일정/결과를 조회.
 * KBO 시즌은 단일연도 (예: 2026).
 */
export async function fetchGames(params: {
  leagueId: number;
  season: number | string;
  date?: string; // YYYY-MM-DD (서버 측 필터)
}): Promise<ApiBaseballGame[]> {
  if (!isApiBaseballEnabled()) {
    throw new Error(
      "API_BASEBALL_KEY 가 설정되지 않았습니다. .env.local 에 키를 입력하세요.",
    );
  }

  const { data } = await client.get<ApiBaseballResponse<ApiBaseballGame>>(
    "/games",
    {
      params: {
        league: params.leagueId,
        season: params.season,
        ...(params.date ? { date: params.date } : {}),
      },
    },
  );

  return data?.response ?? [];
}

/** 리그 검색 (KBO 리그 ID 확인용 등) */
export async function searchLeagues(query: { country?: string; name?: string }) {
  const { data } = await client.get("/leagues", { params: query });
  return data?.response ?? [];
}
