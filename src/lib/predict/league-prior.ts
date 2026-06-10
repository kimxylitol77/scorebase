// 리그 1X2 베이스레이트 prior — Elo 분산이 작은(수집 이력 부족) 리그의 과확신 보정.
//
// 배경 (2026-06 Brier 진단): ts- 수집을 시즌 도중 시작한 리그(우루과이·볼리비아·베네수엘라·
// 벨라루스·핀란드2부·칠레2부·CSL 등)는 팀당 6~19매치뿐이라 Elo stddev 25~50 (정상 70~82).
// 전팀이 1500 근처에 몰려 사실상 홈어드밴티지만 작동 → 모든 매치에 "홈 45%" 고정 출력.
// 게다가 이 리그들은 The Odds API 미커버(시장 odds 0%)라 market-blend 보정도 불가.
// → 모델 신호가 약한 만큼 리그 실측 홈/무/원정 분포로 후퇴시켜 무지 기준선(0.667) 아래로 안정화.
//
// 가중치: Elo stddev 에 연속 비례. 70 이상(정상 리그)이면 0 — EPL 등 기존 성능 불변.
//   BOLIVIA(sd 28.6)→0.27, CSL(25.6)→0.29, URUGUAY(45.0)→0.16, J1(39.9)→0.19 (2026-06 실측)

import type { PredictMatch } from "./types";

/** prior 산출 최소 표본 — 미만이면 베이스레이트 자체가 노이즈라 적용 안 함 */
const MIN_SAMPLE = 30;
/** 이 stddev 이상이면 Elo 가 충분히 학습된 것 — prior 가중 0 */
const FULL_TRUST_SPREAD = 70;
/** prior 최대 가중 (stddev 0 가정의 이론상 한계) */
const MAX_WEIGHT = 0.45;

export interface LeaguePrior {
  home: number;
  draw: number;
  away: number;
  /** 산출에 쓴 FINISHED 매치 수 */
  sample: number;
}

/**
 * referenceTime 이전 FINISHED 매치들의 홈승/무/원정승 실측 분포.
 * 표본 < MIN_SAMPLE 이면 null.
 */
export function calcLeagueBaseRate(
  matches: PredictMatch[],
  referenceTime: Date,
): LeaguePrior | null {
  let h = 0,
    d = 0,
    a = 0;
  const ref = referenceTime.getTime();
  for (const m of matches) {
    if (
      m.status !== "FINISHED" ||
      m.homeScore === null ||
      m.awayScore === null ||
      m.startTime.getTime() >= ref
    )
      continue;
    if (m.homeScore > m.awayScore) h++;
    else if (m.homeScore < m.awayScore) a++;
    else d++;
  }
  const n = h + d + a;
  if (n < MIN_SAMPLE) return null;
  return { home: h / n, draw: d / n, away: a / n, sample: n };
}

/** Elo stddev → prior 가중 (0~MAX_WEIGHT). 분산이 클수록(학습 충분) 0 에 수렴. */
export function priorWeight(eloStddev: number): number {
  const w = MAX_WEIGHT * (1 - eloStddev / FULL_TRUST_SPREAD);
  return Math.max(0, Math.min(MAX_WEIGHT, w));
}

/** 모델 확률에 베이스레이트를 weight 만큼 블렌드 후 정규화. weight 0 이면 그대로. */
export function blendLeaguePrior(
  wp: { home: number; draw: number; away: number },
  prior: LeaguePrior | null,
  weight: number,
): { home: number; draw: number; away: number } {
  if (!prior || weight <= 0) return wp;
  const home = wp.home * (1 - weight) + prior.home * weight;
  const draw = wp.draw * (1 - weight) + prior.draw * weight;
  const away = wp.away * (1 - weight) + prior.away * weight;
  const sum = home + draw + away;
  if (sum <= 0) return wp;
  return { home: home / sum, draw: draw / sum, away: away / sum };
}
