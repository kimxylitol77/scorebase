// TheSports football collector — 축구 35개 매핑된 리그.
//
// 2026-05-18 검증: 응답 구조 baseball 과 다름 (competition_id, home_scores array).
// 우리 collectors index.ts 에 통합하지 않음 (현 단계 trial 검증 전용).
// 화요일 라이브 매치 + 영업 endpoint 권한 받은 후 통합 결정.

import type { League, MatchCollector, NormalizedMatch } from "../types";
import { thesportsGet } from "./client";
import type {
  TSFootballMatchDiaryResponse,
  TSFootballMatch,
  TSFootballTeamMeta,
  TSFootballLineupResponse,
  TSFootballMatchTeamStatsResponse,
  TSFootballMatchPlayerStatsResponse,
  TSFootballH2HResponse,
  TSFootballStandingsResponse,
  TSFootballSeasonTeamStatResponse,
  TSFootballSeasonPlayerStatResponse,
  TSFootballSeasonShooterResponse,
} from "./football-types";
import {
  TS_FOOTBALL_COMPETITION_ID,
  TS_FOOTBALL_LEAGUE_BY_COMPETITION,
  hasFootballMapping,
} from "./football-competitions";

/** 매핑된 35개 League 중 하나의 collector 빌더 */
export function buildTheSportsFootballCollector(
  league: League,
): MatchCollector {
  if (!hasFootballMapping(league)) {
    throw new Error(
      `TheSports football 매핑 없음: ${league}. football-competitions.ts 확장 필요`,
    );
  }
  const compId = TS_FOOTBALL_COMPETITION_ID[league]!;
  return {
    league,
    async fetchByDate(date: string) {
      // KST 자정 → unix timestamp
      const utcMidnight = new Date(`${date}T00:00:00Z`).getTime();
      const kstMidnight = utcMidnight - 9 * 3600 * 1000;
      const tsp = Math.floor(kstMidnight / 1000);

      const resp = await thesportsGet<TSFootballMatchDiaryResponse>(
        "/v1/football/match/diary",
        { tsp },
      );
      const teamMap = new Map<string, TSFootballTeamMeta>();
      for (const t of resp.results_extra?.team ?? []) teamMap.set(t.id, t);

      const matches: NormalizedMatch[] = [];
      for (const m of resp.results) {
        if (m.competition_id !== compId) continue;
        const normalized = normalizeFootballMatch(m, teamMap);
        if (normalized) matches.push(normalized);
      }
      return matches;
    },
  };
}

/** TheSports football raw → NormalizedMatch */
function normalizeFootballMatch(
  m: TSFootballMatch,
  teamMap: Map<string, TSFootballTeamMeta>,
): NormalizedMatch | null {
  const league = TS_FOOTBALL_LEAGUE_BY_COMPETITION[m.competition_id];
  if (!league) return null;

  const home = teamMap.get(m.home_team_id);
  const away = teamMap.get(m.away_team_id);
  if (!home || !away) return null;

  // home_scores/away_scores[0] = 정규시간 종합 (full time)
  const homeScore = m.home_scores?.[0];
  const awayScore = m.away_scores?.[0];

  return {
    league,
    externalId: m.id,
    homeTeam: {
      externalId: m.home_team_id,
      name: home.name,
      shortName: home.short_name,
      logoUrl: home.logo,
    },
    awayTeam: {
      externalId: m.away_team_id,
      name: away.name,
      shortName: away.short_name,
      logoUrl: away.logo,
    },
    homeScore,
    awayScore,
    status: mapFootballStatus(m.status_id),
    startTime: new Date(m.match_time * 1000),
    raw: m,
  };
}

/**
 * TheSports football status_id → 우리 MatchStatus.
 * 5/17 sample 본 status_id=8 (종료). docs Status Code 페이지 확인 필요.
 * 임시 매핑 — 화요일 라이브 매치 받으면 진행 중 코드 검증 후 정정.
 */
function mapFootballStatus(statusId: number): NormalizedMatch["status"] {
  // 8 = 종료된 매치 (5/17 sample 검증)
  if (statusId === 8) return "FINISHED";
  // 추정 — 진행 중 매치 코드 (1~7 정도?)
  if (statusId >= 1 && statusId <= 7) return "LIVE";
  // 추정 — 예정/연기
  if (statusId === 9 || statusId === 10) return "POSTPONED";
  return "SCHEDULED";
}

// ============================================================
// 추가 endpoint 메서드 — 매치 상세 페이지용
// ============================================================

/**
 * 단일 경기 라인업 — formation + x/y 좌표 + rating + incidents + injury.
 * URL 확정: /v1/football/match/lineup/detail
 * Rate: 120 req/min. 최근 30일 매치만.
 */
export function fetchFootballLineup(
  matchId: string,
): Promise<TSFootballLineupResponse> {
  return thesportsGet<TSFootballLineupResponse>(
    "/v1/football/match/lineup/detail",
    { uuid: matchId },
  );
}

/**
 * 경기팀 통계 (매치 단위).
 * URL 미확정 — 영업 받기 대기. 추정: /v1/football/match/stats/detail
 */
export function fetchFootballMatchTeamStats(
  matchId: string,
): Promise<TSFootballMatchTeamStatsResponse> {
  return thesportsGet<TSFootballMatchTeamStatsResponse>(
    "/v1/football/match/stats/detail", // PLACEHOLDER
    { uuid: matchId },
  );
}

/**
 * 경기 선수 통계 (매치 단위).
 * URL 미확정 — 추정: /v1/football/match/player_stats/detail
 */
export function fetchFootballMatchPlayerStats(
  matchId: string,
): Promise<TSFootballMatchPlayerStatsResponse> {
  return thesportsGet<TSFootballMatchPlayerStatsResponse>(
    "/v1/football/match/player_stats/detail", // PLACEHOLDER
    { uuid: matchId },
  );
}

/**
 * H2H — 두 팀 history + future + goal_distribution.
 * URL 미확정 — 추정: /v1/football/match/h2h/detail 또는 /h2h
 */
export function fetchFootballH2H(
  matchId: string,
): Promise<TSFootballH2HResponse> {
  return thesportsGet<TSFootballH2HResponse>(
    "/v1/football/match/h2h/detail", // PLACEHOLDER
    { uuid: matchId },
  );
}

/**
 * 시즌 순위 (최신 시즌).
 * URL 미확정 — 추정: /v1/football/season/recent/standings/detail
 * season_id 필요 (results[].season_id 에서 추출).
 */
export function fetchFootballStandings(
  seasonId: string,
): Promise<TSFootballStandingsResponse> {
  return thesportsGet<TSFootballStandingsResponse>(
    "/v1/football/season/recent/standings/detail", // PLACEHOLDER
    { uuid: seasonId },
  );
}

/** 시즌별 팀 통계 — URL 확정 */
export function fetchFootballSeasonTeamStat(
  seasonId: string,
): Promise<TSFootballSeasonTeamStatResponse> {
  return thesportsGet<TSFootballSeasonTeamStatResponse>(
    "/v1/football/season/recent/team/stat",
    { uuid: seasonId },
  );
}

/** 시즌별 선수 통계 — URL 확정 */
export function fetchFootballSeasonPlayerStat(
  seasonId: string,
): Promise<TSFootballSeasonPlayerStatResponse> {
  return thesportsGet<TSFootballSeasonPlayerStatResponse>(
    "/v1/football/season/recent/player/stat",
    { uuid: seasonId },
  );
}

/** 시즌 득점왕 — URL 확정 */
export function fetchFootballSeasonShooter(
  seasonId: string,
): Promise<TSFootballSeasonShooterResponse> {
  return thesportsGet<TSFootballSeasonShooterResponse>(
    "/v1/football/season/recent/shooter/stat",
    { uuid: seasonId },
  );
}
