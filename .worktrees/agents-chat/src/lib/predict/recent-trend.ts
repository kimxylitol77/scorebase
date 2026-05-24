// 최근 N경기 평균 득점/실점/승점.

import type { PredictMatch } from "./types";

export interface RecentTrend {
  matches: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  /** 경기당 승점 평균 */
  ppg: number;
}

export function calcRecentTrend(
  matches: PredictMatch[],
  teamId: number,
  beforeTime?: Date,
  n = 5,
): RecentTrend {
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;

  const recent = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < cutoff &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, n);

  if (recent.length === 0) {
    return { matches: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, ppg: 0 };
  }

  let gf = 0;
  let ga = 0;
  let pts = 0;
  for (const m of recent) {
    const isHome = m.homeTeamId === teamId;
    const my = isHome ? m.homeScore! : m.awayScore!;
    const opp = isHome ? m.awayScore! : m.homeScore!;
    gf += my;
    ga += opp;
    if (my > opp) pts += 3;
    else if (my === opp) pts += 1;
  }

  return {
    matches: recent.length,
    avgGoalsFor: gf / recent.length,
    avgGoalsAgainst: ga / recent.length,
    ppg: pts / recent.length,
  };
}
