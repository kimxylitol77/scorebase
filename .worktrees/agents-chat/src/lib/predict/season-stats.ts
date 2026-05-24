// 시즌 누적 통계 — 산점도와 시즌 폼 히트맵에 사용.

import type { PredictMatch } from "./types";

export interface TeamSeasonStats {
  teamId: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  /** 경기당 평균 득점 */
  avgGoalsFor: number;
  /** 경기당 평균 실점 */
  avgGoalsAgainst: number;
  goalDiff: number;
}

/**
 * 리그 모든 팀의 시즌 누적 통계.
 */
export function calcSeasonStats(
  matches: PredictMatch[],
  beforeTime?: Date,
): Map<number, TeamSeasonStats> {
  const map = new Map<number, TeamSeasonStats>();
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;

  function ensure(teamId: number) {
    if (!map.has(teamId)) {
      map.set(teamId, {
        teamId,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        avgGoalsFor: 0,
        avgGoalsAgainst: 0,
        goalDiff: 0,
      });
    }
    return map.get(teamId)!;
  }

  for (const m of matches) {
    if (
      m.status !== "FINISHED" ||
      m.homeScore === null ||
      m.awayScore === null
    )
      continue;
    if (m.startTime.getTime() >= cutoff) continue;

    const h = ensure(m.homeTeamId);
    const a = ensure(m.awayTeamId);
    h.played++;
    a.played++;
    h.goalsFor += m.homeScore;
    h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore;
    a.goalsAgainst += m.homeScore;
  }

  for (const s of map.values()) {
    if (s.played > 0) {
      s.avgGoalsFor = s.goalsFor / s.played;
      s.avgGoalsAgainst = s.goalsAgainst / s.played;
      s.goalDiff = s.goalsFor - s.goalsAgainst;
    }
  }

  return map;
}

/**
 * 한 팀의 시즌 매치별 W/D/L 결과를 시간순 배열로.
 * (히트맵에 사용)
 */
export interface SeasonFormCell {
  matchId: number;
  date: Date;
  result: "W" | "D" | "L";
  score: { my: number; opp: number };
  opponent: string;
  isHome: boolean;
}

export function calcSeasonForm(
  matches: PredictMatch[],
  teamId: number,
  beforeTime?: Date,
): SeasonFormCell[] {
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const cells: SeasonFormCell[] = [];

  const sorted = [...matches]
    .filter(
      (m) =>
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < cutoff,
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const m of sorted) {
    const isHome = m.homeTeamId === teamId;
    const my = isHome ? m.homeScore! : m.awayScore!;
    const opp = isHome ? m.awayScore! : m.homeScore!;
    let result: "W" | "D" | "L" = "D";
    if (my > opp) result = "W";
    else if (my < opp) result = "L";
    cells.push({
      matchId: m.id,
      date: m.startTime,
      result,
      score: { my, opp },
      opponent: "", // 이름은 호출자에서 채움
      isHome,
    });
  }

  return cells;
}
