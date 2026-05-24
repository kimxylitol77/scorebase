// 한 팀의 홈 / 원정 split.

import type { PredictMatch } from "./types";

export interface SplitRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** 경기당 승점 (W=3, D=1, L=0) */
  ppg: number;
}

export interface HomeAwayRecord {
  home: SplitRecord;
  away: SplitRecord;
}

function newRec(): SplitRecord {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    ppg: 0,
  };
}

export function calcHomeAway(
  matches: PredictMatch[],
  teamId: number,
  beforeTime?: Date,
): HomeAwayRecord {
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const home = newRec();
  const away = newRec();

  for (const m of matches) {
    if (
      m.status !== "FINISHED" ||
      m.homeScore === null ||
      m.awayScore === null
    )
      continue;
    if (m.startTime.getTime() >= cutoff) continue;

    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;

    const rec = isHome ? home : away;
    const my = isHome ? m.homeScore : m.awayScore;
    const opp = isHome ? m.awayScore : m.homeScore;

    rec.played++;
    rec.goalsFor += my;
    rec.goalsAgainst += opp;
    if (my > opp) rec.wins++;
    else if (my < opp) rec.losses++;
    else rec.draws++;
  }

  for (const r of [home, away]) {
    r.ppg = r.played > 0 ? (r.wins * 3 + r.draws) / r.played : 0;
  }

  return { home, away };
}
