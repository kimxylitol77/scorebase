// 야구·농구 home 승률 과대 보정 — Platt scaling sigmoid(a·logit(p)+c).
// 진단: 모델 predHome 이 실제보다 systematic 과대(고확률일수록 심함, overconfidence + home 쏠림).
//   NHL 64%→실제 52%·MLB 64→53·KBO 62→50·NPB 64→54. 시장 implied 는 실제와 정확히 일치 → 모델만 과대.
// walk-forward(전반 60% fit→후반 40% 검증) out-of-sample Brier: MLB -6.6%·NHL -4.5%·KBO -4.5%·NPB -2.0% 개선.
//   ⚠️ NBA 는 out-of-sample 악화(+1.4%)라 제외 — home 과대가 덜하고 calibration 과적합.
// a<1 = 0.5 쪽 shrink(과신 완화), c<0 = home 쏠림 보정. (2026-06-17 전체 데이터 fit)
const HOME_CALIBRATION: Record<string, { a: number; c: number }> = {
  NHL: { a: 0.5, c: -0.2 },
  MLB: { a: 0.3, c: -0.05 },
  KBO: { a: 0.2, c: -0.1 },
  NPB: { a: 0.45, c: -0.1 },
  // KBL(2026-10-03) — 과거 6시즌 백필 후 측정. 예측 10~20% 구간 실제 43%·80~90% 구간 실제 70% 로 과신.
  //  2024-25 로 적합 → 2025-26 검증 Brier 0.2443→0.2369(-3.0%), 적중 61.8→62.2%.
  KBL: { a: 0.6, c: -0.05 },
};

/**
 * 야구·농구 home 승률(2-way, 무승부 없음) calibration.
 * HOME_CALIBRATION 에 없는 리그(축구·NBA 등)는 원값 그대로 반환.
 */
export function calibrateHomeWinProb(pHome: number, league: string): number {
  const cal = HOME_CALIBRATION[league];
  if (!cal) return pHome;
  const p = Math.min(0.99, Math.max(0.01, pHome));
  const l = Math.log(p / (1 - p));
  return 1 / (1 + Math.exp(-(cal.a * l + cal.c)));
}

/** 해당 리그에 calibration 이 적용되는지 (signalsUsed 표기·테스트용). */
export function hasHomeCalibration(league: string): boolean {
  return league in HOME_CALIBRATION;
}
