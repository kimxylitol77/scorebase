// 한 팀의 최근 N경기 폼 계산.

import type { FormResult, PredictMatch } from "./types";

export interface TeamForm {
  results: FormResult[]; // 가장 최근 → 과거 순
  wins: number;
  draws: number;
  losses: number;
}

/**
 * 특정 팀의 최근 N경기 결과 (현재 경기 이전까지).
 * - matches: 같은 리그의 모든 매치 (FINISHED + SCHEDULED 모두 포함 가능, 내부 필터링)
 * - teamId: 대상 팀
 * - beforeTime: 이 시각 이전 경기만 포함 (기본: 지금)
 * - n: 몇 경기까지
 */
export function calcForm(
  matches: PredictMatch[],
  teamId: number,
  beforeTime: Date = new Date(),
  n = 5,
): TeamForm {
  const past = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < beforeTime.getTime() &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()) // 최신순
    .slice(0, n);

  const results: FormResult[] = past.map((m) => {
    const isHome = m.homeTeamId === teamId;
    const my = isHome ? m.homeScore! : m.awayScore!;
    const opp = isHome ? m.awayScore! : m.homeScore!;
    if (my > opp) return "W";
    if (my < opp) return "L";
    return "D";
  });

  return {
    results,
    wins: results.filter((r) => r === "W").length,
    draws: results.filter((r) => r === "D").length,
    losses: results.filter((r) => r === "L").length,
  };
}
