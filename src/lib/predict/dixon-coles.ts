// src/lib/predict/dixon-coles.ts
// 축구 전용 Dixon-Coles 류 득점 모델.
//
// Elo(승무패 확률만) 가 못 주는 "스코어라인 분포"를 제공한다:
//   팀별 공격/수비 강도(홈/원정 분리 · 시간감쇠 · shrinkage)로 λ(기대 득점) 추정
//   → Poisson 점수 행렬 + Dixon-Coles 저점수 보정(τ)
//   → 1X2 / OVER·UNDER 2.5 / BTTS / 정확 스코어 확률.
//
// MLE 옵티마이저 없이 비율 추정(Maher 류) + DC τ 보정만 적용 → 매 요청 가볍게 계산.
// Elo 와 독립적인 신호이므로 스태킹(Phase 2) 입력으로 사용. 프로덕션 반영은 백테스트 통과 후.
//
// 참고: Dixon & Coles (1997), "Modelling Association Football Scores".

export interface DcMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  startTime: Date;
}

export interface DcPrediction {
  lambdaHome: number;
  lambdaAway: number;
  probHome: number;
  probDraw: number;
  probAway: number;
  probOver25: number;
  probUnder25: number;
  probBttsYes: number;
  probBttsNo: number;
  expGoals: number;
  topScore: { home: number; away: number; prob: number };
  /** 학습에 쓰인 (가중) 표본 — 적으면 신뢰도 낮음. 스태킹/게이트 판단용. */
  sampleHome: number;
  sampleAway: number;
}

// ── 파라미터 (football 표준값 근사) ──────────────────────────────
const HALF_LIFE_DAYS = 120; // 시간감쇠 반감기 (최근 경기 가중)
const DECAY = Math.log(2) / HALF_LIFE_DAYS;
const RHO = -0.12; // Dixon-Coles 저점수 상관 보정 (무승부·저득점 살짝 ↑)
const PRIOR_K = 4; // shrinkage 의사관측 — 표본 적은 팀은 리그평균(ratio=1)으로 수렴
const MAX_GOALS = 8; // 점수 격자 상한 (λ≤6 에서 99.9% 질량 포함)

interface TeamAgg {
  homeFor: number;
  homeAgainst: number;
  homeW: number;
  awayFor: number;
  awayAgainst: number;
  awayW: number;
}

interface TeamStrength {
  attHome: number;
  defHome: number;
  attAway: number;
  defAway: number;
  nHome: number;
  nAway: number;
}

export interface DcStrengths {
  muHome: number; // 리그 평균 홈 득점 (홈 어드밴티지 내포)
  muAway: number; // 리그 평균 원정 득점
  teams: Map<number, TeamStrength>;
}

function poisson(k: number, lambda: number): number {
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

// Dixon-Coles 저점수 보정 τ. lh/la = 홈/원정 기대득점, rho<0.
function tau(i: number, j: number, lh: number, la: number, rho: number): number {
  let t = 1;
  if (i === 0 && j === 0) t = 1 - lh * la * rho;
  else if (i === 0 && j === 1) t = 1 + lh * rho;
  else if (i === 1 && j === 0) t = 1 + la * rho;
  else if (i === 1 && j === 1) t = 1 - rho;
  return t > 0 ? t : 1e-6;
}

/**
 * 리그 과거 경기로 팀별 공/수 강도(홈/원정 분리) 추정.
 * refTime 이전(<) 경기만 사용 = out-of-sample 보장. 시간감쇠 weight 적용.
 */
export function fitDixonColes(matches: DcMatch[], refTime: Date): DcStrengths {
  const ref = refTime.getTime();
  const before = matches.filter((m) => m.startTime.getTime() < ref);
  const w = (m: DcMatch) => Math.exp((-DECAY * (ref - m.startTime.getTime())) / 86400000);

  // 리그 평균 (가중)
  let sumHomeFor = 0,
    sumAwayFor = 0,
    sumW = 0;
  for (const m of before) {
    const ww = w(m);
    sumHomeFor += ww * m.homeScore;
    sumAwayFor += ww * m.awayScore;
    sumW += ww;
  }
  const muHome = sumW > 0 ? sumHomeFor / sumW : 1.45;
  const muAway = sumW > 0 ? sumAwayFor / sumW : 1.15;

  const agg = new Map<number, TeamAgg>();
  const get = (id: number): TeamAgg => {
    let a = agg.get(id);
    if (!a) {
      a = { homeFor: 0, homeAgainst: 0, homeW: 0, awayFor: 0, awayAgainst: 0, awayW: 0 };
      agg.set(id, a);
    }
    return a;
  };
  for (const m of before) {
    const ww = w(m);
    const h = get(m.homeTeamId);
    const a = get(m.awayTeamId);
    h.homeFor += ww * m.homeScore;
    h.homeAgainst += ww * m.awayScore;
    h.homeW += ww;
    a.awayFor += ww * m.awayScore;
    a.awayAgainst += ww * m.homeScore;
    a.awayW += ww;
  }

  // shrinkage 비율: (Σw·v + K·μ) / (Σw + K) / μ  → 표본 적으면 1 로 수렴
  const ratio = (sum: number, wsum: number, mu: number) =>
    (sum + PRIOR_K * mu) / (wsum + PRIOR_K) / mu;

  const teams = new Map<number, TeamStrength>();
  for (const [id, a] of agg) {
    teams.set(id, {
      attHome: ratio(a.homeFor, a.homeW, muHome),
      defHome: ratio(a.homeAgainst, a.homeW, muAway), // 홈에서 내준 득점 vs 평균 원정득점
      attAway: ratio(a.awayFor, a.awayW, muAway),
      defAway: ratio(a.awayAgainst, a.awayW, muHome), // 원정서 내준 득점 vs 평균 홈득점
      nHome: a.homeW,
      nAway: a.awayW,
    });
  }
  return { muHome, muAway, teams };
}

const DEFAULT_TEAM: TeamStrength = {
  attHome: 1,
  defHome: 1,
  attAway: 1,
  defAway: 1,
  nHome: 0,
  nAway: 0,
};

/** 두 팀 DC 예측 → 스코어 행렬 → 마켓 확률. */
export function predictDixonColes(
  s: DcStrengths,
  homeTeamId: number,
  awayTeamId: number,
): DcPrediction {
  const H = s.teams.get(homeTeamId) ?? DEFAULT_TEAM;
  const A = s.teams.get(awayTeamId) ?? DEFAULT_TEAM;
  let lh = H.attHome * A.defAway * s.muHome;
  let la = A.attAway * H.defHome * s.muAway;
  lh = Math.max(0.15, Math.min(6, lh));
  la = Math.max(0.15, Math.min(6, la));

  const ph: number[] = [];
  const pa: number[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    ph[i] = poisson(i, lh);
    pa[i] = poisson(i, la);
  }

  let total = 0;
  const grid: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    grid[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j] * tau(i, j, lh, la, RHO);
      grid[i][j] = p;
      total += p;
    }
  }

  let pHome = 0,
    pDraw = 0,
    pAway = 0,
    pOver = 0,
    pBtts = 0;
  const top = { home: 0, away: 0, prob: -1 };
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = grid[i][j] / total;
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j >= 3) pOver += p;
      if (i >= 1 && j >= 1) pBtts += p;
      if (p > top.prob) {
        top.home = i;
        top.away = j;
        top.prob = p;
      }
    }
  }

  return {
    lambdaHome: lh,
    lambdaAway: la,
    probHome: pHome,
    probDraw: pDraw,
    probAway: pAway,
    probOver25: pOver,
    probUnder25: 1 - pOver,
    probBttsYes: pBtts,
    probBttsNo: 1 - pBtts,
    expGoals: lh + la,
    topScore: top,
    sampleHome: H.nHome,
    sampleAway: A.nAway,
  };
}
