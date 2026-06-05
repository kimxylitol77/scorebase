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
        if (!normalized) continue;
        // safety net — normalize 결과 league 가 builder league 와 다르면 skip.
        // TS_FOOTBALL_LEAGUE_BY_COMPETITION 매핑 충돌/오류로 클럽컵 진출팀 매치가
        // 도메스틱 league row 에 잘못 binding 되는 사고 방지.
        if (normalized.league !== league) {
          console.warn(
            `[ts-football] league mismatch skip: expected=${league} got=${normalized.league} comp=${m.competition_id} match=${m.id}`,
          );
          continue;
        }
        matches.push(normalized);
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
export function mapFootballStatus(statusId: number): NormalizedMatch["status"] {
  // 8 = End(종료). (5/17 sample + production 397건 검증)
  if (statusId === 8) return "FINISHED";
  // 2=전반, 3=하프타임, 4=후반, 5/6=연장, 7=승부차기 → 진행 중(LIVE).
  // status_id 1 = Not started(예정)는 LIVE 에서 분리해 SCHEDULED 로.
  //   - 야구/하키/농구 docs 모두 1 = Not started (status-codes.ts, TheSports 종목 공통 스킴).
  //   - production 검증: LIVE 축구 매치의 score[1]은 4(후반)만 관측, status_id=1 인 LIVE 0건.
  //   - 1 을 LIVE 로 묶으면 킥오프 직후~지연 킥오프 구간의 예정 경기가 LIVE 로 오표시됨
  //     (cache route blockByFuture 가드는 미래 매치만 막아 이 구간은 못 거름, 2026-06-05 검증).
  if (statusId >= 2 && statusId <= 7) return "LIVE";
  // 9=Delay, 10=Interrupt, 12=Cancel — 연기/취소.
  // 12 누락 시 취소 경기가 SCHEDULED 로 방치돼 stale stuck → cleanup 봇이 뒤처리
  // (2026-06-05 적도기니 vs 부룬디 #314637, TheSports 는 12 로 정확히 줬으나 미매핑).
  if (statusId === 9 || statusId === 10 || statusId === 12) return "POSTPONED";
  // 1=Not started, 11=Cut in half, 13=TBD 등 → SCHEDULED.
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
 * H2H (Match analysis) — 두 팀 history + future + goal_distribution.
 * URL 확정: /v1/football/match/analysis. Rate: 60 req/min. 30일 이내 매치만.
 */
export function fetchFootballH2H(
  matchId: string,
): Promise<TSFootballH2HResponse> {
  return thesportsGet<TSFootballH2HResponse>(
    "/v1/football/match/analysis",
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
