// 회원 커스텀 예측 봇 — 손잡이(가중치) 5종으로 1X2 확률을 재계산하는 순수 함수 모듈.
// 서버(피처 벡터 생성·픽 생성)와 클라이언트(슬라이더 즉석 재채점)가 같은 코드를 쓴다.
//
// ── 손잡이 정의 (각 0~200%, 기본 100% = 우리 모델과 동일) ──
// 일반 원칙: 신호 기여 = 모델 기본 기여 + (k - 1) × 신호 전량. k=1 이면 모델 그대로.
//   1) elo(팀 체급)      D_elo  = k.elo × (eloHome - eloAway)
//   2) home(홈 이점)     D_home = k.home × HA (리그 상수 — 축구 70·기타 100 Elo, WC 중립 0)
//   3) form(최근 기세)   D_form = (k.form - 1) × 40 × (최근5경기 ppg 차)
//                        모델 기본 기여 0 (Elo 가 최근 결과를 이미 흡수) — 100%=무반영,
//                        200%=ppg 1.0 차당 +40 Elo, 0%=역방향(폼 역베팅).
//   4) market(대중 시선) 블렌드 가중 w = clamp(w0 × 북메이커보정 × k.market, 0, 0.95)
//                        w0 = 리그 기본(MLB 0.75·그 외 0.6), 북메이커<3 이면 절반
//                        — market-blend.ts 와 동일 소스. 시장 미커버 매치는 자동 무시.
//   5) underdog(언더독)  최종 확률 멱변환 p_i ∝ p_i^γ, γ = 1 - 1.5×(k-1)
//                        100%→γ=1(항등), 0%→γ=2.5(페이버릿 쏠림), 200%→γ=-0.5(순위 역전=언더독 픽).
//
// 확률 산출 순서 (evaluate-predictions.ts 채점 경로 미러 — 고정 단계는 손잡이 없음):
//   expHome = 1/(1+10^(-D/400)), D = D_elo + D_home + D_form
//   → 무승부 모델(drawWeight+closeness×sensitivity) → 리그 prior 블렌드(고정)
//   → 야구 선발 shift(고정) → 시장 블렌드(market 손잡이) → 홈 calibration(고정)
//   → 언더독 멱변환 → argmax 픽.
//   NHL 골리 보정은 피처 커버 0.9%(14/1495) 라 v1 제외 (2026-07-19 조사).

import type { PredictMatch } from "./types";
import { STARTING_ELO, applyEloMatch, eloSpread } from "./elo";
import { homeAdvantageFor, getDrawConfig } from "./win-probability";
import { getDefaultMarketWeight } from "./market-blend";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "./starter-adjust";
import { blendLeaguePrior, priorWeight } from "./league-prior";
import {
  calibrateHomeWinProb,
  hasHomeCalibration,
} from "./home-calibration";
import { calcRecentTrend } from "./recent-trend";

// ── 상수 ──
export const KNOB_MIN = 0;
export const KNOB_MAX = 2;
/** 폼 손잡이 환산 — 최근5 ppg 1.0 차이당 Elo 점수 (전량 = 200% 시점) */
const FORM_ELO_PER_PPG = 40;
/** 언더독 멱변환 기울기 — γ = 1 - SLOPE×(k-1) */
const UNDERDOG_GAMMA_SLOPE = 1.5;
/** 시장 블렌드 가중 상한 (200% 라도 시장 100% 초과 금지) */
const MARKET_W_MAX = 0.95;
/** 멱변환 전 확률 클램프 (γ<0 발산 방지). 0 인 성분(무승부 없는 종목)은 0 유지 */
const POW_CLAMP_LO = 0.02;
const POW_CLAMP_HI = 0.98;
/** 리그 prior 최소 표본 — league-prior.ts MIN_SAMPLE 과 동일 */
const PRIOR_MIN_SAMPLE = 30;

export interface BotKnobs {
  elo: number;
  form: number;
  home: number;
  market: number;
  underdog: number;
}

export const DEFAULT_KNOBS: BotKnobs = {
  elo: 1,
  form: 1,
  home: 1,
  market: 1,
  underdog: 1,
};

export function clampKnobs(raw: Partial<BotKnobs> | null | undefined): BotKnobs {
  const c = (v: unknown, def: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(KNOB_MIN, Math.min(KNOB_MAX, v))
      : def;
  return {
    elo: c(raw?.elo, 1),
    form: c(raw?.form, 1),
    home: c(raw?.home, 1),
    market: c(raw?.market, 1),
    underdog: c(raw?.underdog, 1),
  };
}

export function isDefaultKnobs(k: BotKnobs): boolean {
  return (
    Math.abs(k.elo - 1) < 1e-9 &&
    Math.abs(k.form - 1) < 1e-9 &&
    Math.abs(k.home - 1) < 1e-9 &&
    Math.abs(k.market - 1) < 1e-9 &&
    Math.abs(k.underdog - 1) < 1e-9
  );
}

// ── 피처 벡터 ──

/** 한 경기의 as-of 신호 묶음 — 서버가 1회 생성, 클라이언트가 손잡이 변경마다 재채점 */
export interface BotFeature {
  matchId: number;
  /** 실제 결과 0=HOME 1=DRAW 2=AWAY (미종료 null). DB 점수 기준 — 컵 승부차기 매치는 미세 오차 */
  res: 0 | 1 | 2 | null;
  /** startTime epoch day (UTC) */
  day: number;
  eloHome: number;
  eloAway: number;
  /** 홈 어드밴티지 Elo 상수 (evaluate 경로처럼 팀명 미전달 — WC 는 0) */
  ha: number;
  /** 최근 5경기 경기당 승점 (calcRecentTrend) */
  formHome: number;
  formAway: number;
  /** 야구 선발 보정 homeShift (starter-adjust 산출값, 없으면 0) — 고정 적용 */
  starterShift: number;
  mHome: number | null;
  mDraw: number | null;
  mAway: number | null;
  books: number | null;
  /** 리그 prior 가중 (표본<30 이면 0) — 고정 적용 */
  priorW: number;
  priorHome: number;
  priorDraw: number;
  priorAway: number;
}

/** 리그 단위 상수 — 페이로드에 1회만 실어 클라이언트 재계산에 사용 */
export interface BotLeagueConfig {
  league: string;
  drawWeight: number;
  drawSensitivity: number;
  marketW0: number;
}

export function leagueConfigOf(league: string): BotLeagueConfig {
  const d = getDrawConfig(league);
  return {
    league,
    drawWeight: d.drawWeight,
    drawSensitivity: d.drawSensitivity,
    marketW0: getDefaultMarketWeight(league),
  };
}

/** 와이어 포맷 — [matchId, res, day, eloH, eloA, ha, formH, formA, sShift, mH, mD, mA, books, priorW, pH, pD, pA] */
export type BotFeatureTuple = (number | null)[];

const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export function featureToTuple(f: BotFeature): BotFeatureTuple {
  return [
    f.matchId,
    f.res,
    f.day,
    round(f.eloHome, 1),
    round(f.eloAway, 1),
    f.ha,
    round(f.formHome, 2),
    round(f.formAway, 2),
    round(f.starterShift, 4),
    f.mHome == null ? null : round(f.mHome, 4),
    f.mDraw == null ? null : round(f.mDraw, 4),
    f.mAway == null ? null : round(f.mAway, 4),
    f.books,
    round(f.priorW, 3),
    round(f.priorHome, 3),
    round(f.priorDraw, 3),
    round(f.priorAway, 3),
  ];
}

export function featureFromTuple(t: BotFeatureTuple): BotFeature {
  return {
    matchId: t[0] as number,
    res: t[1] as 0 | 1 | 2 | null,
    day: t[2] as number,
    eloHome: t[3] as number,
    eloAway: t[4] as number,
    ha: t[5] as number,
    formHome: t[6] as number,
    formAway: t[7] as number,
    starterShift: t[8] as number,
    mHome: t[9],
    mDraw: t[10],
    mAway: t[11],
    books: t[12],
    priorW: t[13] as number,
    priorHome: t[14] as number,
    priorDraw: t[15] as number,
    priorAway: t[16] as number,
  };
}

// ── 확률 재계산 (순수) ──

export interface WinProb3 {
  home: number;
  draw: number;
  away: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 피처 + 리그 상수 + 손잡이 → 1X2 확률. 파일 헤더의 수식·순서 그대로. */
export function computeCustomProb(
  f: BotFeature,
  cfg: BotLeagueConfig,
  knobs: BotKnobs,
): WinProb3 {
  // 1) Elo 공간 신호 합성
  const D =
    knobs.elo * (f.eloHome - f.eloAway) +
    knobs.home * f.ha +
    (knobs.form - 1) * FORM_ELO_PER_PPG * (f.formHome - f.formAway);
  const expHome = 1 / (1 + Math.pow(10, -D / 400));

  // 2) 무승부 모델 (calcWinProbability 와 동일)
  const closeness = 1 - Math.abs(expHome - 0.5) * 2;
  const drawProb = cfg.drawWeight + closeness * cfg.drawSensitivity;
  let wp: WinProb3 = {
    home: clamp01(expHome * (1 - drawProb)),
    draw: clamp01(drawProb),
    away: clamp01((1 - expHome) * (1 - drawProb)),
  };

  // 3) 리그 prior 블렌드 (고정 — 손잡이 없음)
  if (f.priorW > 0) {
    wp = blendLeaguePrior(
      wp,
      {
        home: f.priorHome,
        draw: f.priorDraw,
        away: f.priorAway,
        sample: PRIOR_MIN_SAMPLE,
      },
      f.priorW,
    );
  }

  // 4) 야구 선발 shift (고정)
  if (f.starterShift !== 0) {
    wp = applyStarterToWinProb(wp, {
      homeShift: f.starterShift,
      marginShift: 0,
      totalShift: 0,
      applied: true,
    });
  }

  // 5) 시장 블렌드 (market 손잡이) — market-blend.ts 수식과 동일, w 만 손잡이 배율
  if (f.mHome != null && f.mAway != null) {
    const bookFactor = f.books != null && f.books < 3 ? 0.5 : 1;
    const w = Math.max(
      0,
      Math.min(MARKET_W_MAX, cfg.marketW0 * bookFactor * knobs.market),
    );
    if (w > 0) {
      const mDraw = f.mDraw ?? 0;
      const home = wp.home * (1 - w) + f.mHome * w;
      const draw = wp.draw * (1 - w) + mDraw * w;
      const away = wp.away * (1 - w) + f.mAway * w;
      const sum = home + draw + away;
      wp = { home: home / sum, draw: draw / sum, away: away / sum };
    }
  }

  // 6) 홈 calibration (고정 — evaluate 와 동일하게 draw 0 으로 재구성)
  if (hasHomeCalibration(cfg.league)) {
    const calHome = calibrateHomeWinProb(wp.home, cfg.league);
    wp = { home: calHome, draw: 0, away: 1 - calHome };
  }

  // 7) 언더독 멱변환 (underdog 손잡이)
  const gamma = 1 - UNDERDOG_GAMMA_SLOPE * (knobs.underdog - 1);
  if (Math.abs(gamma - 1) > 1e-9) {
    const pow = (p: number) =>
      p < 1e-9
        ? 0
        : Math.pow(Math.max(POW_CLAMP_LO, Math.min(POW_CLAMP_HI, p)), gamma);
    const home = pow(wp.home);
    const draw = pow(wp.draw);
    const away = pow(wp.away);
    const sum = home + draw + away;
    if (sum > 0) wp = { home: home / sum, draw: draw / sum, away: away / sum };
  }

  return wp;
}

/** argmax 픽 — evaluate-predictions.ts recalcWinner 와 동일한 동점 처리 */
export function pickOf(wp: WinProb3): "HOME" | "DRAW" | "AWAY" {
  return wp.home >= wp.away && wp.home >= wp.draw
    ? "HOME"
    : wp.away >= wp.draw
      ? "AWAY"
      : "DRAW";
}

// ── 백테스트 채점 (순수 — 클라이언트에서 슬라이더마다 호출) ──

export interface BotBacktestScore {
  n: number;
  hits: number;
  acc: number;
  /** 3-way Brier (Σ(p-o)² 평균) — 낮을수록 좋음 */
  brier: number;
}

export function scoreBacktest(
  sets: Array<{ cfg: BotLeagueConfig; features: BotFeature[] }>,
  knobs: BotKnobs,
): { total: BotBacktestScore; byLeague: Record<string, BotBacktestScore> } {
  const byLeague: Record<string, BotBacktestScore> = {};
  let n = 0;
  let hits = 0;
  let brierSum = 0;

  for (const { cfg, features } of sets) {
    let ln = 0;
    let lhits = 0;
    let lbrier = 0;
    for (const f of features) {
      if (f.res == null) continue;
      const wp = computeCustomProb(f, cfg, knobs);
      const pick = pickOf(wp);
      const actual = f.res === 0 ? "HOME" : f.res === 1 ? "DRAW" : "AWAY";
      const oH = f.res === 0 ? 1 : 0;
      const oD = f.res === 1 ? 1 : 0;
      const oA = f.res === 2 ? 1 : 0;
      lbrier +=
        (wp.home - oH) ** 2 + (wp.draw - oD) ** 2 + (wp.away - oA) ** 2;
      ln++;
      if (pick === actual) lhits++;
    }
    if (ln > 0) {
      byLeague[cfg.league] = {
        n: ln,
        hits: lhits,
        acc: lhits / ln,
        brier: lbrier / ln,
      };
      n += ln;
      hits += lhits;
      brierSum += lbrier;
    }
  }

  return {
    total: { n, hits, acc: n > 0 ? hits / n : 0, brier: n > 0 ? brierSum / n : 0 },
    byLeague,
  };
}

// ── 피처 벡터 생성 (서버 — 리그 히스토리 시간순 단일 스캔) ──

export interface BotTargetInput {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  startTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  homeStarter?: string | null;
  awayStarter?: string | null;
  marketHome?: number | null;
  marketDraw?: number | null;
  marketAway?: number | null;
  marketBookmakers?: number | null;
}

interface StarterJson {
  era?: number;
  whip?: number;
  k9?: number;
  gs?: number;
  recentEra?: number;
}

function parseStarter(s: string | null | undefined): StarterJson | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as StarterJson;
  } catch {
    return null;
  }
}

/**
 * 타깃 경기들의 as-of 피처를 한 번의 시간순 스캔으로 생성.
 * Elo·리그 prior 는 증분 갱신 (O(N) — 타깃마다 prefix 재계산 금지, 조사 2절 주의사항).
 * 같은 startTime 매치는 evaluate 의 strictly-before 필터와 동일하게 반영 전 스냅샷.
 */
export function buildLeagueFeatures(
  all: PredictMatch[],
  targets: BotTargetInput[],
  league: string,
): BotFeature[] {
  const sorted = [...all].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
  const sortedTargets = [...targets].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  const ratings = new Map<number, number>();
  // 리그 prior 증분 카운트 (calcLeagueBaseRate 와 동일 대상: FINISHED + 점수 보유)
  let ph = 0;
  let pd = 0;
  let pa = 0;
  const ha = homeAdvantageFor(league);

  const out: BotFeature[] = [];
  let i = 0;
  for (const t of sortedTargets) {
    const ref = t.startTime.getTime();
    // ref 이전 매치만 반영 (strictly before — 동시간대 매치 제외)
    while (i < sorted.length && sorted[i].startTime.getTime() < ref) {
      const m = sorted[i];
      if (applyEloMatch(ratings, m)) {
        if (m.homeScore! > m.awayScore!) ph++;
        else if (m.homeScore! < m.awayScore!) pa++;
        else pd++;
      }
      i++;
    }

    const eloHome = ratings.get(t.homeTeamId) ?? STARTING_ELO;
    const eloAway = ratings.get(t.awayTeamId) ?? STARTING_ELO;

    const priorN = ph + pd + pa;
    const spread = eloSpread({ ratings, processed: 0 });
    const pw = priorN >= PRIOR_MIN_SAMPLE ? priorWeight(spread) : 0;

    const formHome = calcRecentTrend(all, t.homeTeamId, t.startTime, 5).ppg;
    const formAway = calcRecentTrend(all, t.awayTeamId, t.startTime, 5).ppg;

    const sAdj = computeStarterAdjustment(
      parseStarter(t.homeStarter),
      parseStarter(t.awayStarter),
      league,
    );

    const res: BotFeature["res"] =
      t.homeScore == null || t.awayScore == null
        ? null
        : t.homeScore > t.awayScore
          ? 0
          : t.homeScore < t.awayScore
            ? 2
            : 1;

    out.push({
      matchId: t.id,
      res,
      day: Math.floor(ref / 86_400_000),
      eloHome,
      eloAway,
      ha,
      formHome,
      formAway,
      starterShift: sAdj.applied ? sAdj.homeShift : 0,
      mHome: t.marketHome ?? null,
      mDraw: t.marketDraw ?? null,
      mAway: t.marketAway ?? null,
      books: t.marketBookmakers ?? null,
      priorW: pw,
      priorHome: priorN > 0 ? ph / priorN : 0,
      priorDraw: priorN > 0 ? pd / priorN : 0,
      priorAway: priorN > 0 ? pa / priorN : 0,
    });
  }

  return out;
}
