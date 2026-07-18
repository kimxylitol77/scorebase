// xG 쌍(λ홈·λ원정)을 독립 Poisson 으로 보고 승/무/패 확률과 xPTS(기대 승점)를 계산하는 공용 헬퍼
// 사용처: 월드컵 xG 트래커 부합도, /standings xG 탭, 팀 프로필 xG 추이.

export interface XgOutcome {
  pHome: number;
  pDraw: number;
  pAway: number;
  xptsHome: number; // 3×P(홈승) + P(무)
  xptsAway: number;
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / f;
}

// 0~10골 격자 합산 — 축구 xG 범위(대부분 0~5)에서 잔여 질량은 정규화로 흡수.
const MAX_GOALS = 10;

export function xgOutcome(xgHome: number, xgAway: number): XgOutcome {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    ph.push(poissonPmf(k, xgHome));
    pa.push(poissonPmf(k, xgAway));
  }
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph[h] * pa[a];
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
    }
  }
  const total = pHome + pDraw + pAway;
  pHome /= total;
  pDraw /= total;
  pAway /= total;
  return { pHome, pDraw, pAway, xptsHome: 3 * pHome + pDraw, xptsAway: 3 * pAway + pDraw };
}

// fixtureStats 는 [home, away] 순서 고정 (af /fixtures/statistics, predictionEngine.ts 검증).
// af 는 expected_goals 를 문자열("1.15")로 줄 수 있어 Number() 로 방어적 변환.
export function parseFixtureXg(fixtureStats: string | null): { home: number | null; away: number | null } {
  if (!fixtureStats) return { home: null, away: null };
  try {
    const fs = JSON.parse(fixtureStats) as Array<{ expectedGoals?: unknown }>;
    const h = Number(fs[0]?.expectedGoals);
    const a = Number(fs[1]?.expectedGoals);
    return { home: Number.isFinite(h) ? h : null, away: Number.isFinite(a) ? a : null };
  } catch {
    return { home: null, away: null };
  }
}

/** 실제 결과(스코어)가 xG 내용에서 나올 확률(%) — 낮을수록 이변·불운. */
export function xgFairnessPct(
  xgHome: number,
  xgAway: number,
  homeScore: number,
  awayScore: number,
): number {
  const o = xgOutcome(xgHome, xgAway);
  const p = homeScore > awayScore ? o.pHome : homeScore < awayScore ? o.pAway : o.pDraw;
  return Math.round(p * 100);
}
