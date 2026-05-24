// 매치 스코어 분포 — Poisson(λ_home) × Poisson(λ_away) 결합.
// λ 추정: Elo 격차로 추정한 1X2 + 리그 평균 골수를 결합해 양 팀 기대 골.
// 향후 운영 점수 분포 보강 시 Dixon-Coles correlation 추가 여지 있음 (지금은 독립 가정).

const MAX_GOALS = 7;
const TOP_K = 3;

const LEAGUE_AVG_TOTAL_GOALS: Record<string, number> = {
  EPL: 2.85,
  LALIGA: 2.55,
  BUNDESLIGA: 3.20,
  SERIE_A: 2.65,
  LIGUE_1: 2.65,
  MLS: 3.05,
  UCL: 3.10,
  WORLD_CUP: 2.65,
};

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // log space 로 안정성 확보
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFact);
}

export interface ScoreProb {
  home: number;
  away: number;
  /** 0~1 확률 */
  prob: number;
}

/**
 * 스코어 분포 빌더 (축구 전용).
 *
 * @param winProb 모델이 추정한 1X2 (Elo 기반)
 * @param league   리그 — 평균 골수 lookup
 * @returns 가장 흔한 TOP_K 스코어 + 전체 그리드 합 확률 (validation)
 */
export function buildScoreDistribution(
  winProb: { home: number; draw: number; away: number },
  league: string,
): { topScores: ScoreProb[]; gridSum: number; lambdaHome: number; lambdaAway: number } {
  const total = LEAGUE_AVG_TOTAL_GOALS[league] ?? 2.7;

  // 1X2 확률 → 양 팀 기대 골 비율 추정
  // 직관: 홈 우세가 클수록 home goals 비중 ↑.
  // 무승부 확률은 양 팀 골 비등으로 분배. 단순 선형 보간.
  const homeShare = winProb.home + winProb.draw * 0.5;
  const awayShare = winProb.away + winProb.draw * 0.5;
  const lambdaHome = total * homeShare;
  const lambdaAway = total * awayShare;

  // 그리드 (0~MAX_GOALS) × (0~MAX_GOALS) 확률 계산
  const probs: ScoreProb[] = [];
  let gridSum = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    const pH = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= MAX_GOALS; a++) {
      const pA = poissonPmf(a, lambdaAway);
      const p = pH * pA;
      gridSum += p;
      probs.push({ home: h, away: a, prob: p });
    }
  }
  probs.sort((x, y) => y.prob - x.prob);
  return {
    topScores: probs.slice(0, TOP_K),
    gridSum,
    lambdaHome,
    lambdaAway,
  };
}

/** 본문/프롬프트에 넣을 사람이 읽는 한 줄 — "2-1(8.2%), 1-1(7.8%), 2-0(7.1%)" */
export function formatTopScores(top: ScoreProb[]): string {
  return top
    .map((s) => `${s.home}-${s.away}(${(s.prob * 100).toFixed(1)}%)`)
    .join(", ");
}
