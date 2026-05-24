// 시즌 순위 — 우리 DB의 매치 결과로 직접 계산.
// (football-data.org standings 응답과 거의 일치)

import type { PredictMatch } from "./types";

export interface StandingRow {
  teamId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /** 1-based 순위 (승점 동률은 골득실 → 득점 순) */
  position: number;
}

export interface StandingSummary {
  /** 모든 팀 순위 */
  rows: StandingRow[];
  /** teamId 로 빠르게 lookup */
  byTeam: Map<number, StandingRow>;
  /** 공격력 랭킹 (경기당 득점 내림차순) */
  attackRank: Map<number, number>; // teamId → 1-based rank
  /** 수비력 랭킹 (경기당 실점 오름차순) */
  defenseRank: Map<number, number>;
}

export function calcStandings(
  matches: PredictMatch[],
  beforeTime?: Date,
): StandingSummary {
  const map = new Map<number, StandingRow>();
  const cutoff = beforeTime?.getTime() ?? Number.MAX_SAFE_INTEGER;

  function ensure(teamId: number): StandingRow {
    if (!map.has(teamId)) {
      map.set(teamId, {
        teamId,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDiff: 0,
        points: 0,
        position: 0,
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

    if (m.homeScore > m.awayScore) {
      h.wins++;
      h.points += 3;
      a.losses++;
    } else if (m.homeScore < m.awayScore) {
      a.wins++;
      a.points += 3;
      h.losses++;
    } else {
      h.draws++;
      h.points += 1;
      a.draws++;
      a.points += 1;
    }
  }

  for (const r of map.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;

  const rows = Array.from(map.values()).sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDiff - a.goalDiff ||
      b.goalsFor - a.goalsFor,
  );
  rows.forEach((r, i) => (r.position = i + 1));

  // 공격/수비 랭킹 (경기당 평균)
  const attackSorted = [...rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => b.goalsFor / b.played - a.goalsFor / a.played);
  const defenseSorted = [...rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => a.goalsAgainst / a.played - b.goalsAgainst / b.played);

  const attackRank = new Map<number, number>();
  const defenseRank = new Map<number, number>();
  attackSorted.forEach((r, i) => attackRank.set(r.teamId, i + 1));
  defenseSorted.forEach((r, i) => defenseRank.set(r.teamId, i + 1));

  return {
    rows,
    byTeam: new Map(rows.map((r) => [r.teamId, r])),
    attackRank,
    defenseRank,
  };
}
