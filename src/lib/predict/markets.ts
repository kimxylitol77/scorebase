// 추가 예측 시장 — Double Chance / OVER 2.5 / BTTS
// 축구 7개 리그(EPL·라리가·분데스리가·세리에A·리그앙·MLS·UCL) 전용.

import type { PredictMatch } from "./types";

/* =====================================================================
 * Double Chance — winProb (1X2) 데이터 그대로 활용. 가장 높은 합 선택.
 * ===================================================================*/

export type DcPick = "1X" | "X2" | "12";

export function bestDoubleChance(wp: {
  home: number;
  draw: number;
  away: number;
}): { pick: DcPick; prob: number } {
  const opts: Array<{ pick: DcPick; prob: number }> = [
    { pick: "1X", prob: wp.home + wp.draw },
    { pick: "X2", prob: wp.away + wp.draw },
    { pick: "12", prob: wp.home + wp.away },
  ];
  opts.sort((a, b) => b.prob - a.prob);
  return opts[0];
}

export function dcCorrect(
  pick: DcPick,
  actual: "HOME" | "DRAW" | "AWAY",
): boolean {
  if (pick === "1X") return actual === "HOME" || actual === "DRAW";
  if (pick === "X2") return actual === "AWAY" || actual === "DRAW";
  return actual === "HOME" || actual === "AWAY";
}

/* =====================================================================
 * Poisson 기반 OVER 2.5 + BTTS — 양 팀의 시즌 평균 득/실점에서 λ 추정.
 * 정밀한 xG 가 없으니 단순화 모델이지만 50% baseline 대비 신호 잡기엔 충분.
 * ===================================================================*/

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

interface TeamGoals {
  scoredPerGame: number;
  concededPerGame: number;
  sample: number;
}

function teamGoalAverages(
  matches: PredictMatch[],
  teamId: number,
  asOf: Date,
): TeamGoals {
  const past = matches.filter(
    (m) =>
      m.startTime.getTime() < asOf.getTime() &&
      m.status === "FINISHED" &&
      m.homeScore != null &&
      m.awayScore != null &&
      (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  if (past.length === 0) {
    return { scoredPerGame: 1.3, concededPerGame: 1.3, sample: 0 };
  }
  let scored = 0;
  let conceded = 0;
  for (const m of past) {
    if (m.homeTeamId === teamId) {
      scored += m.homeScore ?? 0;
      conceded += m.awayScore ?? 0;
    } else {
      scored += m.awayScore ?? 0;
      conceded += m.homeScore ?? 0;
    }
  }
  return {
    scoredPerGame: scored / past.length,
    concededPerGame: conceded / past.length,
    sample: past.length,
  };
}

const HOME_BOOST = 1.1; // 홈팀 약 10% 부스트

/**
 * 양 팀 평균에서 λ_home, λ_away 추정 후 OVER 2.5 / BTTS 확률 산출.
 * OVER 2.5 = P(total >= 3) = 1 - Σ_{i+j<=2} P(home=i) P(away=j)
 * BTTS    = P(home>=1) * P(away>=1)  (독립 가정)
 */
export function predictGoalsMarket(
  matches: PredictMatch[],
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
): { lambdaHome: number; lambdaAway: number; pOver: number; pBtts: number; sample: number } {
  const home = teamGoalAverages(matches, homeTeamId, asOf);
  const away = teamGoalAverages(matches, awayTeamId, asOf);

  const lambdaHome =
    ((home.scoredPerGame + away.concededPerGame) / 2) * HOME_BOOST;
  const lambdaAway = (away.scoredPerGame + home.concededPerGame) / 2;

  // P(total <= 2)
  let pUnder = 0;
  for (let i = 0; i <= 2; i++) {
    for (let j = 0; j + i <= 2; j++) {
      pUnder += poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
    }
  }
  const pOver = Math.max(0, Math.min(1, 1 - pUnder));

  const pHomeNoGoal = poissonPmf(0, lambdaHome);
  const pAwayNoGoal = poissonPmf(0, lambdaAway);
  const pBtts = Math.max(0, Math.min(1, (1 - pHomeNoGoal) * (1 - pAwayNoGoal)));

  return {
    lambdaHome,
    lambdaAway,
    pOver,
    pBtts,
    sample: Math.min(home.sample, away.sample),
  };
}

export function overActual(homeScore: number, awayScore: number): "OVER" | "UNDER" {
  return homeScore + awayScore > 2.5 ? "OVER" : "UNDER";
}
export function bttsActual(homeScore: number, awayScore: number): "YES" | "NO" {
  return homeScore > 0 && awayScore > 0 ? "YES" : "NO";
}

/** 축구 리그만 OVER/BTTS/DC 적용 */
export const SOCCER_LEAGUES_FOR_MARKETS = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
]);
