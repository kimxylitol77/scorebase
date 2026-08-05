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
  TSFootballScores,
  TSFootballTeamMeta,
  TSFootballLineupResponse,
  TSFootballLineupPlayer,
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

  // home_scores/away_scores: [0]=정규시간, [5]=연장 포함 총점, [6]=승부차기.
  // 연장 간 경기(컵/토너먼트)는 [5]가 최종 스코어 — [0]만 쓰면 정규 동점으로 덮여
  // 브래킷에 1-1 같은 불가능한 결과가 표시된다(2026-07-12 노르웨이-잉글랜드 사고).
  // 승부차기([6])는 절대 합산하지 않는다(과거 UCL 결승 4-3 오염 사고).
  const finalScore = (arr?: TSFootballScores): number | undefined => {
    if (!arr) return undefined;
    const reg = Number(arr[0]);
    const ot = Number(arr[5]);
    if (!Number.isFinite(reg)) return undefined;
    return Number.isFinite(ot) && ot > 0 && ot >= reg ? ot : reg;
  };
  const homeScore = finalScore(m.home_scores);
  const awayScore = finalScore(m.away_scores);

  return {
    league,
    // worker ws-push(thesports-matches route)가 `ts-{id}` 로 저장하므로 동일 prefix 사용.
    // prefix 불일치 시 같은 ts 매치가 `id` 와 `ts-id` 두 row 로 중복됨(CLUB_FRIENDLY 20쌍 사고).
    externalId: `ts-${m.id}`,
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
    status: mapFootballStatus(m.status_id, new Date(m.match_time * 1000)),
    startTime: new Date(m.match_time * 1000),
    // 그 경기의 실제 구장 — 홈팀 기본 구장 추정과 달리 중립 경기장도 맞는다.
    venueId: m.venue_id || undefined,
    raw: m,
  };
}

/**
 * TheSports football status_id → 우리 MatchStatus.
 * 5/17 sample 본 status_id=8 (종료). docs Status Code 페이지 확인 필요.
 * 임시 매핑 — 화요일 라이브 매치 받으면 진행 중 코드 검증 후 정정.
 */
export function mapFootballStatus(statusId: number, startTime?: Date): NormalizedMatch["status"] {
  // 8 = End(종료). (5/17 sample + production 397건 검증)
  if (statusId === 8) return "FINISHED";
  // 2=전반, 3=하프타임, 4=후반, 5/6=연장, 7=승부차기 → 진행 중(LIVE).
  // status_id 1 = Not started(예정)는 LIVE 에서 분리해 SCHEDULED 로.
  //   - 야구/하키/농구 docs 모두 1 = Not started (status-codes.ts, TheSports 종목 공통 스킴).
  //   - production 검증: LIVE 축구 매치의 score[1]은 4(후반)만 관측, status_id=1 인 LIVE 0건.
  //   - 1 을 LIVE 로 묶으면 킥오프 직후~지연 킥오프 구간의 예정 경기가 LIVE 로 오표시됨
  //     (cache route blockByFuture 가드는 미래 매치만 막아 이 구간은 못 거름, 2026-06-05 검증).
  if (statusId >= 2 && statusId <= 7) return "LIVE";
  // 12=Cancel(취소)은 시점 무관 POSTPONED. 12 누락 시 취소 경기가 SCHEDULED 로 방치돼 stale stuck
  // (2026-06-05 적도기니 vs 부룬디 #314637, TheSports 는 12 로 정확히 줬으나 미매핑).
  if (statusId === 12) return "POSTPONED";
  // 9=Delay·10=Interrupt = 킥오프 지연·경기 중 중단. "완전 연기"가 아니라 곧 재개될 수 있는 코드다.
  // 미래~킥오프 6h 이내면 SCHEDULED 유지(/scores 에서 안 사라짐), 6h 넘게 지나야 연기 확정 POSTPONED.
  //   - TheSports 가 예정/킥오프 임박 경기에 일시 9 를 부여하면 사라졌던 문제
  //     (2026-07-01 멕시코 vs 에콰도르 #677025, 킥오프 직후에도 9 로 POSTPONED 돼 /scores 에서 빠짐).
  if (statusId === 9 || statusId === 10) {
    const sinceKickoff = startTime ? Date.now() - startTime.getTime() : Infinity;
    return sinceKickoff < 6 * 3600 * 1000 ? "SCHEDULED" : "POSTPONED";
  }
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

// ============================================================
// TheSports lineup → Match.lineupHome/lineupAway 변환
// ============================================================

/** Match.lineupHome/away 저장 shape — api-football FixtureLineup 과 동일 계약.
 *  (RECAP/PREVIEW 글 생성·챗봇이 JSON.parse 해 그대로 소비) */
export interface ConvertedLineup {
  teamName: string;
  formation?: string;
  startXI: string[]; // 선수 이름 11명 (G→D→M→F 순)
}

const TS_POSITION_ORDER: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

/**
 * TheSports lineup/detail results → af FixtureLineup 호환 shape.
 * confirmed=1(공식 라인업) + 양팀 선발 11명일 때만 변환, 아니면 null.
 * 확장 리그(ts- 매치)는 api-football cron 이 못 채우므로 이 변환이 1순위 소스.
 */
export function convertTsLineup(
  raw: unknown,
  homeTeamName: string,
  awayTeamName: string,
): { home: ConvertedLineup; away: ConvertedLineup } | null {
  const lu = raw as TSFootballLineupResponse["results"] | null;
  if (!lu || typeof lu !== "object" || lu.confirmed !== 1) return null;
  const pick = (side: TSFootballLineupPlayer[] | undefined): string[] =>
    (side ?? [])
      .filter((p) => p.first === 1 && p.name)
      .sort(
        (a, b) =>
          (TS_POSITION_ORDER[a.position] ?? 9) - (TS_POSITION_ORDER[b.position] ?? 9),
      )
      .map((p) => p.name);
  const home = pick(lu.lineup?.home);
  const away = pick(lu.lineup?.away);
  if (home.length < 11 || away.length < 11) return null;
  return {
    home: {
      teamName: homeTeamName,
      formation: lu.home_formation || undefined,
      startXI: home,
    },
    away: {
      teamName: awayTeamName,
      formation: lu.away_formation || undefined,
      startXI: away,
    },
  };
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
