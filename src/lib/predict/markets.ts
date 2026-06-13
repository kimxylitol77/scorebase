// 추가 예측 시장 — Double Chance / OVER (총득점) / BTTS / Handicap
// 종목별 baseline 이 달라서 SPORT_PROFILE 매핑으로 통일.

import type { PredictMatch } from "./types";
import { calculateInningScoreProbs } from "./baseball-poisson";
import { getParkFactor } from "./park-factors";

/* =====================================================================
 * Double Chance — winProb (1X2) 데이터 그대로. 무승부 있는 종목(축구)만 의미.
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
 * 종목별 OVER/UNDER + 핸디캡 — 모두 Normal CDF 기반 통일 모델
 * ===================================================================*/

interface SportProfile {
  /** OVER/UNDER 기준선 — 종목 평균값 부근 */
  overLine: number;
  /** 매치 총 득점 분포 표준편차 (시즌 통계 기반 경험값) */
  totalStd: number;
  /** 매치 마진(home - away) 분포 표준편차 — 핸디캡용 */
  marginStd: number;
  /** 핸디캡 line — 강팀 입장 절대값 (예: NBA 5.5점) */
  handicapLine: number;
  /** 단일 매치 평균 득점 추정 시 홈 부스트 */
  homeBoost: number;
}

const SPORT_PROFILE: Record<string, SportProfile> = {
  // 축구 — 평균 2.7골/매치. handicapLine 1.5 (강팀 2골 차+) — 0.5 는 1X2 와 거의 동일해서 의미 적음
  EPL: { overLine: 2.5, totalStd: 1.6, marginStd: 1.5, handicapLine: 0.5, homeBoost: 1.1 },
  LALIGA: { overLine: 2.5, totalStd: 1.6, marginStd: 1.5, handicapLine: 0.5, homeBoost: 1.1 },
  BUNDESLIGA: { overLine: 2.5, totalStd: 1.7, marginStd: 1.6, handicapLine: 0.5, homeBoost: 1.1 },
  SERIE_A: { overLine: 2.5, totalStd: 1.5, marginStd: 1.4, handicapLine: 0.5, homeBoost: 1.1 },
  LIGUE_1: { overLine: 2.5, totalStd: 1.6, marginStd: 1.5, handicapLine: 0.5, homeBoost: 1.1 },
  MLS: { overLine: 2.5, totalStd: 1.7, marginStd: 1.6, handicapLine: 0.5, homeBoost: 1.1 },
  UCL: { overLine: 2.5, totalStd: 1.7, marginStd: 1.6, handicapLine: 0.5, homeBoost: 1.1 },
  // 농구 — NBA 평균 222점/매치, std 약 18, margin std 약 14
  NBA: { overLine: 220.5, totalStd: 18, marginStd: 14, handicapLine: 5.5, homeBoost: 1.025 },
  // 아이스하키 — NHL 평균 6.0골, std 2.5, margin std 2.4
  NHL: { overLine: 5.5, totalStd: 2.5, marginStd: 2.4, handicapLine: 1.5, homeBoost: 1.05 },
  // 야구 — MLB 평균 8.7런, std 4.0, margin std 3.5
  MLB: { overLine: 8.5, totalStd: 4.0, marginStd: 3.5, handicapLine: 1.5, homeBoost: 1.04 },
  // KBO 야구 — 한국 프로야구. 평균 9~10런 시즌.
  // 실측 평균 마진 -0.18 / std 4.83 — 홈 어드밴티지 사실상 없음, 분산 큼.
  // overLine 9.5 (장타 코스), homeBoost 1.0 (실측 반영), marginStd 4.5 (실측 근사).
  KBO: { overLine: 9.5, totalStd: 4.5, marginStd: 4.5, handicapLine: 1.5, homeBoost: 1.0 },
  // NPB 일본 프로야구 — 평균 8~9런 시즌 (KBO 보다 낮음, MLB 와 유사).
  // KBO 패턴 그대로 시작 후 실측 시즌 데이터로 조정 가능.
  NPB: { overLine: 8.5, totalStd: 4.0, marginStd: 3.8, handicapLine: 1.5, homeBoost: 1.02 },
};

/* =====================================================================
 * Skellam 분포 — Poisson(λ1) - Poisson(λ2) 의 차이 분포
 * 축구처럼 점수 작을 때 핸디캡(=골 차이) 정확히 모델링.
 * 큰 점수(NBA 등)는 Normal 근사가 충분히 정확하므로 여전히 Normal.
 * ===================================================================*/

function logFactorial(n: number): number {
  if (n < 2) return 0;
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

/** Modified Bessel I_n(x) — log space 시리즈 합 (저차 정확) */
function logBesselI(n: number, x: number): number {
  const absN = Math.abs(n);
  // I_n(x) = sum_{k=0..} (x/2)^(2k+n) / (k! * (k+n)!)
  // log term: (2k+n)*log(x/2) - logFact(k) - logFact(k+n)
  const logHalfX = Math.log(x / 2);
  let maxLog = -Infinity;
  const terms: number[] = [];
  for (let k = 0; k < 60; k++) {
    const logTerm =
      (2 * k + absN) * logHalfX - logFactorial(k) - logFactorial(k + absN);
    terms.push(logTerm);
    if (logTerm > maxLog) maxLog = logTerm;
    if (k > 10 && logTerm < maxLog - 30) break; // 수렴
  }
  // log-sum-exp
  let sum = 0;
  for (const t of terms) sum += Math.exp(t - maxLog);
  return maxLog + Math.log(sum);
}

function skellamPmf(k: number, lambda1: number, lambda2: number): number {
  if (lambda1 <= 0 && lambda2 <= 0) return k === 0 ? 1 : 0;
  if (lambda1 <= 0) return Math.exp(-lambda2) * Math.pow(lambda2, -k) / Math.exp(logFactorial(-k));
  if (lambda2 <= 0) return Math.exp(-lambda1) * Math.pow(lambda1, k) / Math.exp(logFactorial(k));
  // log P = -(λ1+λ2) + (k/2)*log(λ1/λ2) + log I_|k|(2*sqrt(λ1*λ2))
  const logP =
    -(lambda1 + lambda2) +
    (k / 2) * Math.log(lambda1 / lambda2) +
    logBesselI(k, 2 * Math.sqrt(lambda1 * lambda2));
  return Math.exp(logP);
}

/** P(margin > line) — 정수 line 이면 strict, 0.5 line 이면 ceil(line) 부터 */
function skellamProbGreaterThan(
  line: number,
  lambda1: number,
  lambda2: number,
): number {
  const start = Math.floor(line) + 1;
  let sum = 0;
  for (let k = start; k <= 30; k++) {
    const p = skellamPmf(k, lambda1, lambda2);
    sum += p;
    if (k > start + 5 && p < 1e-7) break;
  }
  return Math.max(0, Math.min(1, sum));
}

export function getSportProfile(league: string): SportProfile | null {
  return SPORT_PROFILE[league] ?? null;
}

// erf approximation (Abramowitz & Stegun 7.1.26)
function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(x: number, mean: number, std: number): number {
  return 0.5 * (1 + erf((x - mean) / (std * Math.sqrt(2))));
}

interface TeamGoals {
  scoredPerGame: number;
  concededPerGame: number;
  sample: number;
}

/**
 * 팀의 평균 득점·실점.
 *
 * @param venue 'home' / 'away' / 'all' (기본 'all')
 *   야구처럼 홈/원정 격차가 큰 종목은 분리해서 사용.
 * @param recentBlend 0~1. 1 이면 최근 N경기만, 0 이면 시즌 평균만.
 *   기본 0.4 — 시즌 60% + 최근 40%.
 */
function teamGoalAverages(
  matches: PredictMatch[],
  teamId: number,
  asOf: Date,
  opts?: { venue?: "home" | "away" | "all"; recentBlend?: number; recentN?: number },
): TeamGoals {
  const venue = opts?.venue ?? "all";
  const recentBlend = opts?.recentBlend ?? 0;
  const recentN = opts?.recentN ?? 10;

  const past = matches.filter(
    (m) =>
      m.startTime.getTime() < asOf.getTime() &&
      m.status === "FINISHED" &&
      m.homeScore != null &&
      m.awayScore != null &&
      (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  if (past.length === 0) {
    return { scoredPerGame: 0, concededPerGame: 0, sample: 0 };
  }

  // venue 필터 — 홈/원정 분리
  const filtered =
    venue === "home"
      ? past.filter((m) => m.homeTeamId === teamId)
      : venue === "away"
        ? past.filter((m) => m.awayTeamId === teamId)
        : past;

  // 표본이 너무 적으면 venue 필터 풀고 all 로 fallback
  const used = filtered.length >= 5 ? filtered : past;

  const compute = (list: PredictMatch[]) => {
    let scored = 0;
    let conceded = 0;
    for (const m of list) {
      if (m.homeTeamId === teamId) {
        scored += m.homeScore ?? 0;
        conceded += m.awayScore ?? 0;
      } else {
        scored += m.awayScore ?? 0;
        conceded += m.homeScore ?? 0;
      }
    }
    return {
      scoredPerGame: scored / list.length,
      concededPerGame: conceded / list.length,
    };
  };

  const seasonAvg = compute(used);

  if (recentBlend <= 0 || used.length <= recentN) {
    return { ...seasonAvg, sample: used.length };
  }

  // 최근 N경기 가중치 (시간순 sort 후 마지막 N)
  const sorted = [...used].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const recent = sorted.slice(-recentN);
  const recentAvg = compute(recent);

  return {
    scoredPerGame:
      seasonAvg.scoredPerGame * (1 - recentBlend) +
      recentAvg.scoredPerGame * recentBlend,
    concededPerGame:
      seasonAvg.concededPerGame * (1 - recentBlend) +
      recentAvg.concededPerGame * recentBlend,
    sample: used.length,
  };
}

const BULLPEN_ERA_FALLBACK = 4.2;

/**
 * 야구 OU expectedTotal — baseball-poisson(선발 ERA 6이닝·불펜 3이닝·구장·최근 폼 반영).
 * 양 선발 ERA 가용 시에만 호출 (없으면 호출 측이 팀평균 모델로 fallback).
 * baseball-context.enrichBaseballContext 와 동일 입력 소스(venue 무관 시즌 평균 + 최근5 폼).
 * walk-forward 백테스트 통과(2026-06-13): MLB 선발경기 52.1→54.9%·KBO 51.2→54.4%, OVER 쏠림 90→48%.
 */
function baseballPoissonTotal(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
  s: { homeEra: number; awayEra: number; homeTeamName?: string },
): { expectedTotal: number; sample: number } | null {
  const home = teamGoalAverages(matches, homeTeamId, asOf, { venue: "all", recentBlend: 0 });
  const away = teamGoalAverages(matches, awayTeamId, asOf, { venue: "all", recentBlend: 0 });
  if (home.sample === 0 || away.sample === 0) return null;
  // 최근 폼 = 최근5경기 평균 득점 - 시즌 평균, ±0.4 클램프 (baseball-context 동일).
  const homeRecent = teamGoalAverages(matches, homeTeamId, asOf, { venue: "all", recentBlend: 1, recentN: 5 });
  const awayRecent = teamGoalAverages(matches, awayTeamId, asOf, { venue: "all", recentBlend: 1, recentN: 5 });
  const clampForm = (v: number) => Math.max(-0.4, Math.min(0.4, v));
  const homeForm = clampForm(homeRecent.scoredPerGame - home.scoredPerGame);
  const awayForm = clampForm(awayRecent.scoredPerGame - away.scoredPerGame);
  const park = s.homeTeamName
    ? getParkFactor(league as "KBO" | "NPB" | "MLB", s.homeTeamName)
    : 1.0;
  // team1 = 원정(away), team2 = 홈(home) — baseball-poisson / baseball-context 규약
  const poisson = calculateInningScoreProbs({
    team1AvgRpg: away.scoredPerGame,
    team1AvgRApg: away.concededPerGame,
    team2AvgRpg: home.scoredPerGame,
    team2AvgRApg: home.concededPerGame,
    team1StarterEra: s.awayEra,
    team2StarterEra: s.homeEra,
    team1StarterInnings: 5.5,
    team2StarterInnings: 5.5,
    team1BullpenEra: BULLPEN_ERA_FALLBACK,
    team2BullpenEra: BULLPEN_ERA_FALLBACK,
    parkFactor: park,
    team1RecentForm: awayForm,
    team2RecentForm: homeForm,
  });
  return {
    expectedTotal: poisson.totalExpectedRuns.team1 + poisson.totalExpectedRuns.team2,
    sample: Math.min(home.sample, away.sample),
  };
}

/**
 * 종목별 OVER/UNDER 추정.
 * 야구(KBO/MLB/NPB) + 양 선발 ERA 가용 → baseball-poisson 모델(선발/구장/불펜/폼).
 * 그 외 → expected_total = 양 팀 공격력 + 상대 수비력의 평균을 Normal(std=종목별)로 가정.
 */
export function predictTotalMarket(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
  opts?: { homeStarterEra?: number; awayStarterEra?: number; homeTeamName?: string },
): {
  expectedTotal: number;
  pOver: number;
  line: number;
  sample: number;
} | null {
  const profile = getSportProfile(league);
  if (!profile) return null;
  // 야구는 홈/원정 격차 + 최근 폼 영향 큼 — KBO·MLB 분리 사용
  const isBaseball = league === "KBO" || league === "MLB" || league === "NPB";

  // 야구 + 양 선발 ERA 가용 → baseball-poisson 으로 정밀 expectedTotal (백테스트 통과 V2).
  if (isBaseball && opts?.homeStarterEra != null && opts?.awayStarterEra != null) {
    const pt = baseballPoissonTotal(matches, league, homeTeamId, awayTeamId, asOf, {
      homeEra: opts.homeStarterEra,
      awayEra: opts.awayStarterEra,
      homeTeamName: opts.homeTeamName,
    });
    if (pt) {
      const pOver = 1 - normalCdf(profile.overLine, pt.expectedTotal, profile.totalStd);
      return {
        expectedTotal: pt.expectedTotal,
        pOver: Math.max(0.01, Math.min(0.99, pOver)),
        line: profile.overLine,
        sample: pt.sample,
      };
    }
  }

  const home = teamGoalAverages(matches, homeTeamId, asOf, {
    venue: isBaseball ? "home" : "all",
    recentBlend: isBaseball ? 0.4 : 0,
  });
  const away = teamGoalAverages(matches, awayTeamId, asOf, {
    venue: isBaseball ? "away" : "all",
    recentBlend: isBaseball ? 0.4 : 0,
  });
  const sample = Math.min(home.sample, away.sample);
  if (sample === 0) return null;

  const expectedHome =
    ((home.scoredPerGame + away.concededPerGame) / 2) * profile.homeBoost;
  const expectedAway = (away.scoredPerGame + home.concededPerGame) / 2;
  const expectedTotal = expectedHome + expectedAway;

  const pOver = 1 - normalCdf(profile.overLine, expectedTotal, profile.totalStd);
  return {
    expectedTotal,
    pOver: Math.max(0.01, Math.min(0.99, pOver)),
    line: profile.overLine,
    sample,
  };
}

/**
 * 핸디캡 — 강팀 -line 이상 차이로 이길 확률.
 * margin = home_score - away_score, Normal(mean=expected_margin, std=종목별).
 * 강팀 = expected_margin > 0 면 home, else away.
 */
export function predictHandicapMarket(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
): {
  pick: "HOME" | "AWAY";
  line: number;
  prob: number;
  expectedMargin: number;
} | null {
  const profile = getSportProfile(league);
  if (!profile) return null;
  const isBaseball = league === "KBO" || league === "MLB" || league === "NPB";
  const home = teamGoalAverages(matches, homeTeamId, asOf, {
    venue: isBaseball ? "home" : "all",
    recentBlend: isBaseball ? 0.4 : 0,
  });
  const away = teamGoalAverages(matches, awayTeamId, asOf, {
    venue: isBaseball ? "away" : "all",
    recentBlend: isBaseball ? 0.4 : 0,
  });
  if (Math.min(home.sample, away.sample) === 0) return null;

  const expectedHome =
    ((home.scoredPerGame + away.concededPerGame) / 2) * profile.homeBoost;
  const expectedAway = (away.scoredPerGame + home.concededPerGame) / 2;
  const expectedMargin = expectedHome - expectedAway;

  // 양쪽 cover 확률을 다 계산 후 더 높은 쪽을 픽한다.
  // 핵심: 야구처럼 점수 폭 작은 종목은 1점 차 게임 빈도가 높아서
  // "강팀 -1.5" 보다 "약팀 +1.5 받기" 가 적중률 높을 수 있음.
  // 현재 코드 (강팀 픽 강제) 가 KBO 핸디 적중률 35% 의 원인.
  const useSkellam = SOCCER_LEAGUES_FOR_MARKETS.has(league);
  const line = profile.handicapLine;

  // P(home wins by line+) — 홈이 -line 핸디 cover
  const homeCovers = useSkellam
    ? skellamProbGreaterThan(line, expectedHome, expectedAway)
    : 1 - normalCdf(line, expectedMargin, profile.marginStd);

  // P(away wins by line+ OR away loses by less than line) — 어웨이가 +line 핸디 cover
  // = P(margin < line) under home view = normalCdf(line, margin, std) for non-soccer
  // 단 0.5 line 이라 push 없음
  const awayCovers = useSkellam
    ? skellamProbGreaterThan(line, expectedAway, expectedHome) +
      // 약팀 핸디는 "지더라도 line 미만 차로" 까지 포함 (margin < -line 이 아니어야 함)
      // = 1 - P(home wins by line+) - P(즈ush) ≈ 1 - homeCovers (push 거의 없음)
      0  // skellam 결과는 양 끝 한쪽이라 약팀 cover = 1 - homeCovers - tie. 단순화: 1-homeCovers
    : normalCdf(line, expectedMargin, profile.marginStd);
  const awayCoverProb = useSkellam ? 1 - homeCovers : awayCovers;

  const homeBetter = homeCovers >= awayCoverProb;
  const pick: "HOME" | "AWAY" = homeBetter ? "HOME" : "AWAY";
  const prob = homeBetter ? homeCovers : awayCoverProb;

  return {
    pick,
    line,
    prob: Math.max(0.01, Math.min(0.99, prob)),
    expectedMargin,
  };
}

export function handicapCorrect(
  pick: "HOME" | "AWAY",
  line: number,
  homeScore: number,
  awayScore: number,
): boolean {
  // 핸디캡 시장 표준 의미:
  // pick = HOME → "홈에 -line 핸디" → 홈이 line 차 이상으로 이겨야 cover
  // pick = AWAY → "어웨이에 +line 핸디" → 어웨이가 -line 이내로 지거나 이김 = margin < line
  const margin = homeScore - awayScore;
  if (pick === "HOME") return margin > line;
  return margin < line;
}

/* =====================================================================
 * 축구 전용 — Poisson 기반 BTTS (양 팀 득점)
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

/** 축구 전용 — Poisson per team에서 BTTS 확률 산출 */
export function predictBttsMarket(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
): { pBtts: number; lambdaHome: number; lambdaAway: number } | null {
  const profile = getSportProfile(league);
  if (!profile) return null;
  if (!SOCCER_LEAGUES_FOR_MARKETS.has(league)) return null;
  const home = teamGoalAverages(matches, homeTeamId, asOf);
  const away = teamGoalAverages(matches, awayTeamId, asOf);
  if (Math.min(home.sample, away.sample) === 0) return null;
  const lambdaHome =
    ((home.scoredPerGame + away.concededPerGame) / 2) * profile.homeBoost;
  const lambdaAway = (away.scoredPerGame + home.concededPerGame) / 2;
  const pHomeNoGoal = poissonPmf(0, lambdaHome);
  const pAwayNoGoal = poissonPmf(0, lambdaAway);
  const pBtts = (1 - pHomeNoGoal) * (1 - pAwayNoGoal);
  return {
    pBtts: Math.max(0, Math.min(1, pBtts)),
    lambdaHome,
    lambdaAway,
  };
}

/**
 * @deprecated — 호환 유지용. 새 코드는 predictTotalMarket + predictBttsMarket 사용.
 */
export function predictGoalsMarket(
  matches: PredictMatch[],
  homeTeamId: number,
  awayTeamId: number,
  asOf: Date,
): {
  lambdaHome: number;
  lambdaAway: number;
  pOver: number;
  pBtts: number;
  sample: number;
} {
  // 축구 EPL 기본 가정으로 fallback (후방 호환)
  const total = predictTotalMarket(matches, "EPL", homeTeamId, awayTeamId, asOf);
  const btts = predictBttsMarket(matches, "EPL", homeTeamId, awayTeamId, asOf);
  return {
    lambdaHome: btts?.lambdaHome ?? 0,
    lambdaAway: btts?.lambdaAway ?? 0,
    pOver: total?.pOver ?? 0.5,
    pBtts: btts?.pBtts ?? 0.5,
    sample: total?.sample ?? 0,
  };
}

export function overActual(
  homeScore: number,
  awayScore: number,
  line: number,
): "OVER" | "UNDER" {
  return homeScore + awayScore > line ? "OVER" : "UNDER";
}
export function bttsActual(homeScore: number, awayScore: number): "YES" | "NO" {
  return homeScore > 0 && awayScore > 0 ? "YES" : "NO";
}

/** 축구 리그만 BTTS/DC 적용 — OVER/핸디캡은 모든 종목 */
export const SOCCER_LEAGUES_FOR_MARKETS = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
]);
