// 야구(KBO/MLB) 이닝별 득점 확률 모델 — Poisson 분포 기반.
//
// 각 이닝의 기대 득점 λ 를 [팀 시즌 평균 + 상대 투수 ERA + 구장 + 최근 폼] 으로
// 산정하고, k=0~4 런 PMF 를 계산. 6회 이후는 불펜 ERA 로 전환.
// 최종 승률은 두 팀 누적 λ 에 대한 Skellam 시뮬레이션 (Monte Carlo 5000회).
//
// 사용:
//   import { calculateInningScoreProbs } from "@/lib/predict/baseball-poisson";
//   const out = calculateInningScoreProbs({ team1AvgRpg: 4.8, ... });

export interface PoissonInput {
  /** 팀1(원정) 게임당 평균 득점. 예: 4.8 */
  team1AvgRpg: number;
  /** 팀1 게임당 평균 실점. */
  team1AvgRApg: number;
  /** 팀2(홈) 게임당 평균 득점. */
  team2AvgRpg: number;
  team2AvgRApg: number;

  /** 팀1 선발 ERA. 예: 2.45 */
  team1StarterEra: number;
  team2StarterEra: number;
  /** 팀1 선발 평균 등판 이닝. 예: 5.8 */
  team1StarterInnings: number;
  team2StarterInnings: number;

  /** 팀1 불펜 ERA. */
  team1BullpenEra: number;
  team2BullpenEra: number;

  /** 구장 factor (홈팀 기준). 1.0 = 중립, >1.0 = 타자 구장. */
  parkFactor: number;
  /** 최근 폼 (최근 5경기 득점 — 시즌 평균). -0.2 ~ +0.2 권장. */
  team1RecentForm: number;
  team2RecentForm: number;
}

export interface InningProb {
  inning: number;
  /** k=0,1,2,3,4+런 확률. */
  team1RunProb: number[];
  team2RunProb: number[];
  team1ExpectedRuns: number;
  team2ExpectedRuns: number;
  pitcherFactor: "starter" | "bullpen";
}

export interface PoissonOutput {
  inningProbs: InningProb[];
  totalExpectedRuns: { team1: number; team2: number };
  winProb: { team1: number; team2: number };
}

const LEAGUE_AVG_ERA = 4.2;
const INNINGS = 9;
const STARTER_INNINGS_CUTOFF = 6; // 7회부터 불펜

export function calculateInningScoreProbs(input: PoissonInput): PoissonOutput {
  const result: InningProb[] = [];

  for (let inning = 1; inning <= INNINGS; inning++) {
    const useStarter = inning <= STARTER_INNINGS_CUTOFF;
    const team1Era = useStarter ? input.team1StarterEra : input.team1BullpenEra;
    const team2Era = useStarter ? input.team2StarterEra : input.team2BullpenEra;

    // λ = (시즌 평균/9) + (상대투수ERA - 리그평균ERA)/9 + 구장 + 폼
    // 상대 투수 ERA 가 리그 평균보다 낮으면 (좋은 투수) → 우리 득점 ↓
    // 상대 ERA 가 높으면 (나쁜 투수) → 우리 득점 ↑
    const team1ExpRuns =
      input.team1AvgRpg / 9 +
      (team2Era - LEAGUE_AVG_ERA) / 9 +
      (input.parkFactor - 1) * 0.5 +
      input.team1RecentForm / 9;

    const team2ExpRuns =
      input.team2AvgRpg / 9 +
      (team1Era - LEAGUE_AVG_ERA) / 9 +
      (input.parkFactor - 1) * 0.5 +
      input.team2RecentForm / 9;

    const t1 = Math.max(0.05, team1ExpRuns);
    const t2 = Math.max(0.05, team2ExpRuns);

    // 0,1,2,3 런 PMF + 4+런 = 1 - sum(0~3)
    const t1Probs = [0, 1, 2, 3].map((k) => poissonPmf(k, t1));
    const t2Probs = [0, 1, 2, 3].map((k) => poissonPmf(k, t2));
    t1Probs.push(Math.max(0, 1 - t1Probs.reduce((s, v) => s + v, 0)));
    t2Probs.push(Math.max(0, 1 - t2Probs.reduce((s, v) => s + v, 0)));

    result.push({
      inning,
      team1RunProb: t1Probs,
      team2RunProb: t2Probs,
      team1ExpectedRuns: team1ExpRuns,
      team2ExpectedRuns: team2ExpRuns,
      pitcherFactor: useStarter ? "starter" : "bullpen",
    });
  }

  const team1Total = result.reduce((s, r) => s + r.team1ExpectedRuns, 0);
  const team2Total = result.reduce((s, r) => s + r.team2ExpectedRuns, 0);

  const winProb = skellamWinProb(
    Math.max(0.1, team1Total),
    Math.max(0.1, team2Total),
  );

  return {
    inningProbs: result,
    totalExpectedRuns: { team1: team1Total, team2: team2Total },
    winProb,
  };
}

// ============================================================
// Internal helpers
// ============================================================

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** 두 Poisson(λ1, λ2) 차이의 부호 — Monte Carlo 시뮬레이션. 야구는 무승부 거의 없어서 50/50 분배. */
function skellamWinProb(
  lambda1: number,
  lambda2: number,
): { team1: number; team2: number } {
  let team1Win = 0;
  let draw = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const s1 = samplePoisson(lambda1);
    const s2 = samplePoisson(lambda2);
    if (s1 > s2) team1Win++;
    else if (s1 === s2) draw++;
  }
  const t1 = (team1Win + draw / 2) / N;
  return { team1: t1, team2: 1 - t1 };
}

/** Knuth 알고리즘. lambda 작을 때 안정. */
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
