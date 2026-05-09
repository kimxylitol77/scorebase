// 한 팀의 다양한 streak 지표 — 무패 N경기, 연승, 클린시트 등.

import type { PredictMatch } from "./types";

export interface Streaks {
  /** 가장 최근 무패 연속 경기 수 (W 또는 D) */
  unbeatenRun: number;
  /** 가장 최근 연승 */
  winningRun: number;
  /** 가장 최근 연패 */
  losingRun: number;
  /** 최근 5경기 중 클린시트 횟수 */
  cleanSheetsLast5: number;
  /** 최근 5경기 중 무득점 횟수 */
  failedToScoreLast5: number;
}

interface MatchView {
  result: "W" | "D" | "L";
  myGoals: number;
  oppGoals: number;
  date: Date;
}

function asView(m: PredictMatch, teamId: number): MatchView | null {
  if (m.homeScore === null || m.awayScore === null) return null;
  const isHome = m.homeTeamId === teamId;
  const isAway = m.awayTeamId === teamId;
  if (!isHome && !isAway) return null;
  const my = isHome ? m.homeScore : m.awayScore;
  const opp = isHome ? m.awayScore : m.homeScore;
  let result: "W" | "D" | "L" = "D";
  if (my > opp) result = "W";
  else if (my < opp) result = "L";
  return { result, myGoals: my, oppGoals: opp, date: m.startTime };
}

export function calcStreaks(
  matches: PredictMatch[],
  teamId: number,
  beforeTime?: Date,
): Streaks {
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;

  const recent: MatchView[] = [];
  for (const m of matches) {
    if (m.status !== "FINISHED") continue;
    if (m.startTime.getTime() >= cutoff) continue;
    const v = asView(m, teamId);
    if (v) recent.push(v);
  }
  recent.sort((a, b) => b.date.getTime() - a.date.getTime());

  let unbeaten = 0;
  for (const r of recent) {
    if (r.result === "W" || r.result === "D") unbeaten++;
    else break;
  }

  let winning = 0;
  for (const r of recent) {
    if (r.result === "W") winning++;
    else break;
  }

  let losing = 0;
  for (const r of recent) {
    if (r.result === "L") losing++;
    else break;
  }

  const last5 = recent.slice(0, 5);
  const cleanSheetsLast5 = last5.filter((r) => r.oppGoals === 0).length;
  const failedToScoreLast5 = last5.filter((r) => r.myGoals === 0).length;

  return {
    unbeatenRun: unbeaten,
    winningRun: winning,
    losingRun: losing,
    cleanSheetsLast5,
    failedToScoreLast5,
  };
}
