// 두 팀 간 상대 전적 (Head-to-Head).

import type { PredictMatch } from "./types";

export interface H2HSummary {
  total: number;
  homeTeamWins: number;
  awayTeamWins: number;
  draws: number;
  /** 최근 5경기 결과 (최신순). 각 항목은 homeTeam 기준 W/D/L */
  recentForHome: Array<"W" | "D" | "L">;
}

export function calcH2H(
  matches: PredictMatch[],
  homeTeamId: number,
  awayTeamId: number,
  beforeTime: Date = new Date(),
  n = 5,
): H2HSummary {
  const involving = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < beforeTime.getTime() &&
        ((m.homeTeamId === homeTeamId && m.awayTeamId === awayTeamId) ||
          (m.homeTeamId === awayTeamId && m.awayTeamId === homeTeamId)),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  let homeTeamWins = 0;
  let awayTeamWins = 0;
  let draws = 0;

  for (const m of involving) {
    const homeIsTarget = m.homeTeamId === homeTeamId;
    const targetScore = homeIsTarget ? m.homeScore! : m.awayScore!;
    const otherScore = homeIsTarget ? m.awayScore! : m.homeScore!;
    if (targetScore > otherScore) homeTeamWins++;
    else if (targetScore < otherScore) awayTeamWins++;
    else draws++;
  }

  const recentForHome: Array<"W" | "D" | "L"> = involving.slice(0, n).map((m) => {
    const homeIsTarget = m.homeTeamId === homeTeamId;
    const my = homeIsTarget ? m.homeScore! : m.awayScore!;
    const opp = homeIsTarget ? m.awayScore! : m.homeScore!;
    if (my > opp) return "W";
    if (my < opp) return "L";
    return "D";
  });

  return {
    total: involving.length,
    homeTeamWins,
    awayTeamWins,
    draws,
    recentForHome,
  };
}
