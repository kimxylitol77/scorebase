// TheSports API HTTP client (REST only — WebSocket은 별도 worker에서).
// user/secret 환경변수: THESPORTS_USER, THESPORTS_SECRET.
// IP whitelist 필수 (https://www.thesports.com/user/ips) — Vercel serverless 동적 IP 사용 불가.
// Production은 고정 IP 워커 서버 (Hetzner 등) 에서 호출.

import axios, { AxiosInstance } from "axios";

const BASE_URL = "https://api.thesports.com";

let cachedClient: AxiosInstance | null = null;

function buildClient(): AxiosInstance {
  if (cachedClient) return cachedClient;
  const user = process.env.THESPORTS_USER;
  const secret = process.env.THESPORTS_SECRET;
  if (!user || !secret) {
    throw new Error(
      "THESPORTS_USER / THESPORTS_SECRET 환경변수가 설정되지 않았습니다.",
    );
  }
  cachedClient = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    // user/secret 은 모든 요청에 query 로 자동 첨부
    params: { user, secret },
    headers: { Accept: "application/json" },
  });
  return cachedClient;
}

/**
 * TheSports GET helper.
 * @param path  endpoint (e.g. "/v1/baseball/match/diary")
 * @param params  추가 query (user/secret 자동 첨부)
 * @returns 응답 body. code !== 0 시 throw.
 */
export async function thesportsGet<T extends { code: number }>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const client = buildClient();
  const { data } = await client.get<T>(path, { params });
  if (data.code !== 0) {
    throw new Error(`TheSports ${path} returned code=${data.code}`);
  }
  return data;
}

// ============================================================
// Convenience helpers — 각 endpoint 별
// ============================================================

import type {
  TSMatchDiaryResponse,
  TSMatchListResponse,
  TSDetailLiveResponse,
  TSUniqueTournamentListResponse,
} from "./types";

/** 특정 날짜 24h 매치 list (KST 자정 timestamp 권장) */
export function fetchBaseballMatchDiary(
  tsp: number,
): Promise<TSMatchDiaryResponse> {
  return thesportsGet<TSMatchDiaryResponse>("/v1/baseball/match/diary", { tsp });
}

/** 전체 매치 페이지네이션 또는 증분(time) 업데이트 */
export function fetchBaseballMatchList(opts: {
  page?: number;
  time?: number;
  uuid?: string;
}): Promise<TSMatchListResponse> {
  const params: Record<string, number | string> = {};
  if (opts.page != null) params.page = opts.page;
  if (opts.time != null) params.time = opts.time;
  if (opts.uuid) params.uuid = opts.uuid;
  return thesportsGet<TSMatchListResponse>("/v1/baseball/match/list", params);
}

/** 현재 라이브 매치 score + stats + extra (2초 polling 권장) */
export function fetchBaseballDetailLive(): Promise<TSDetailLiveResponse> {
  return thesportsGet<TSDetailLiveResponse>(
    "/v1/baseball/match/detail_live",
    {},
  );
}

/** 토너먼트 목록 — KBO/NPB 외 신규 리그 ID 알아낼 때 */
export function fetchBaseballUniqueTournaments(
  page = 1,
): Promise<TSUniqueTournamentListResponse> {
  return thesportsGet<TSUniqueTournamentListResponse>(
    "/v1/baseball/unique_tournament/list",
    { page },
  );
}

// ============================================================
// Football — 2026-05-19 신규 4개 endpoint (영업 답변 후 확정)
// ============================================================

import type {
  TSFootballMatchPlayerStatsListResponse,
  TSFootballMatchTeamStatsListResponse,
  TSFootballMatchHalfTeamStatsListResponse,
  TSFootballSeasonStandingsResponse,
} from "./football-types";

/**
 * 변경된 player stats list (delta, 직전 120초).
 * Suggested poll: 1min/time.
 * Docs: Match player statistics.
 */
export function fetchFootballMatchPlayerStatsList(): Promise<TSFootballMatchPlayerStatsListResponse> {
  return thesportsGet<TSFootballMatchPlayerStatsListResponse>(
    "/v1/football/match/player_stats/list",
    {},
  );
}

/**
 * 변경된 team stats list (delta, 직전 120초) — 풀타임 named fields.
 * Suggested poll: 1min/time.
 * Docs: Match team statistics.
 */
export function fetchFootballMatchTeamStatsList(): Promise<TSFootballMatchTeamStatsListResponse> {
  return thesportsGet<TSFootballMatchTeamStatsListResponse>(
    "/v1/football/match/team_stats/list",
    {},
  );
}

/**
 * 변경된 half-time team stats list (delta) — `{p1: {stat_type_id: [home, away]}}` 구조.
 * Suggested poll: 1min/time.
 * Docs: Match team half-time statistics.
 */
export function fetchFootballMatchHalfTeamStatsList(): Promise<TSFootballMatchHalfTeamStatsListResponse> {
  return thesportsGet<TSFootballMatchHalfTeamStatsListResponse>(
    "/v1/football/match/half/team_stats/list",
    {},
  );
}

/**
 * 시즌 순위표 (현재 시즌만, restriction: newest season).
 * Rate limit: 120 req/min.
 * Docs: Season standing(newest season).
 *
 * @param seasonId 우리 league_code → ts season_id 매핑 (`league-id-mapping.json` 추후 확장)
 * @returns `{promotions, tables}` — tables[].rows[] = team 순위 + 풀/홈/원정 split
 */
export function fetchFootballSeasonStandings(
  seasonId: string,
): Promise<TSFootballSeasonStandingsResponse> {
  return thesportsGet<TSFootballSeasonStandingsResponse>(
    "/v1/football/season/recent/table/detail",
    { uuid: seasonId },
  );
}
