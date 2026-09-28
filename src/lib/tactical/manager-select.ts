// 이달의 감독 선정 점수 — 경기당 승점에 "경기 전 예측 대비 초과 성과"를 더해 전력 대비 잘한 감독을 올린다.
export interface SelectMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
}

export interface SelectRow {
  teamId: number;
  played: number;
  ppg: number;
  /** 경기 전 예측으로 본 기대 경기당 승점. 예측이 하나도 없으면 null */
  expectedPpg: number | null;
  /** ppg - expectedPpg. 예측이 없으면 0 */
  over: number;
  gdPerGame: number;
  score: number;
}

/** 초과 성과 가중 — 성적이 먼저고, 초과 성과는 비슷한 성적끼리 순서를 가른다. */
export const OVER_WEIGHT = 0.5;

export function selectionTable(matches: SelectMatch[]): SelectRow[] {
  const acc = new Map<number, { played: number; pts: number; gd: number; exp: number; expN: number }>();
  const add = (teamId: number, pts: number, gd: number, exp: number | null) => {
    const r = acc.get(teamId) ?? { played: 0, pts: 0, gd: 0, exp: 0, expN: 0 };
    r.played++;
    r.pts += pts;
    r.gd += gd;
    if (exp != null) {
      r.exp += exp;
      r.expN++;
    }
    acc.set(teamId, r);
  };
  for (const m of matches) {
    const sum = (m.predHome ?? 0) + (m.predDraw ?? 0) + (m.predAway ?? 0);
    const ok = m.predHome != null && m.predDraw != null && m.predAway != null && sum > 0;
    const homePts = m.homeScore > m.awayScore ? 3 : m.homeScore === m.awayScore ? 1 : 0;
    const awayPts = homePts === 3 ? 0 : homePts === 1 ? 1 : 3;
    add(m.homeTeamId, homePts, m.homeScore - m.awayScore, ok ? (3 * m.predHome! + m.predDraw!) / sum : null);
    add(m.awayTeamId, awayPts, m.awayScore - m.homeScore, ok ? (3 * m.predAway! + m.predDraw!) / sum : null);
  }
  return [...acc.entries()]
    .map(([teamId, r]) => {
      const ppg = r.pts / r.played;
      const expectedPpg = r.expN ? r.exp / r.expN : null;
      const over = expectedPpg == null ? 0 : ppg - expectedPpg;
      const gdPerGame = r.gd / r.played;
      return { teamId, played: r.played, ppg, expectedPpg, over, gdPerGame, score: ppg + OVER_WEIGHT * over + gdPerGame / 100 };
    })
    .sort((a, b) => b.score - a.score);
}
