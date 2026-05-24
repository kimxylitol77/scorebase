// TheSports 야구 collector — KBO/NPB/MLB.
// fetchByDate(date) → /v1/baseball/match/diary 호출 + 해당 리그 필터.
// 라이브 score 보강은 별도 helper (fetchLiveScores).

import type {
  League,
  MatchCollector,
  NormalizedMatch,
} from "../types";
import { fetchBaseballMatchDiary, fetchBaseballDetailLive } from "./client";
import {
  normalizeBaseballMatch,
  buildTeamMap,
  buildTournamentMap,
  tournamentIdForLeague,
} from "./normalize";
import type { TSBaseballLeague, TSLiveExtra, TSScores } from "./types";

/** KBO/NPB/MLB collector 빌더 */
export function buildTheSportsBaseballCollector(
  league: TSBaseballLeague,
): MatchCollector {
  return {
    league: league as League,
    async fetchByDate(date: string) {
      // date "YYYY-MM-DD" → KST 자정 timestamp
      // KST = UTC+9. JS Date.parse("YYYY-MM-DD") = UTC 자정.
      // KST 자정 = UTC 자정 - 9시간.
      const utcMidnight = new Date(`${date}T00:00:00Z`).getTime();
      const kstMidnight = utcMidnight - 9 * 3600 * 1000;
      const tsp = Math.floor(kstMidnight / 1000);

      const resp = await fetchBaseballMatchDiary(tsp);
      const teamMap = buildTeamMap(resp.results_extra?.team);
      const tournamentMap = buildTournamentMap(
        resp.results_extra?.unique_tournament,
      );
      const targetTournament = tournamentIdForLeague(league);

      const matches: NormalizedMatch[] = [];
      for (const m of resp.results) {
        if (m.unique_tournament_id !== targetTournament) continue;
        const normalized = normalizeBaseballMatch({
          match: m,
          teamMap,
          tournamentMap,
        });
        if (normalized) matches.push(normalized);
      }
      return matches;
    },
  };
}

/** 라이브 매치의 extra (count/base/out) 빠르게 받기 — 2초 polling 권장 */
export async function fetchLiveScoresMap(): Promise<Map<string, LiveSnapshot>> {
  const resp = await fetchBaseballDetailLive();
  const map = new Map<string, LiveSnapshot>();
  for (const m of resp.results) {
    const [matchId, statusId, battingTeam, scores] = m.score;
    map.set(matchId, {
      matchId,
      statusId,
      battingTeam,
      scores,
      extra: (m.extra && Object.keys(m.extra).length > 0
        ? (m.extra as TSLiveExtra)
        : undefined),
    });
  }
  return map;
}

export interface LiveSnapshot {
  matchId: string;
  /** 100 = FINISHED, 그 외 진행 중 (정확한 매핑은 status-codes.ts 참조) */
  statusId: number;
  /** 현재 타격 팀: 1=home, 2=away, 0=unknown */
  battingTeam: number;
  scores: TSScores;
  /** 종료된 매치는 undefined */
  extra?: TSLiveExtra;
}
