// 우리 모델 + 베팅 시장 odds ensemble.
//
// 베팅사이트 평균 odds (vig 제거된 implied probability) 는 수억 원이
// 걸린 시장의 합의된 예측. 우리 모델만 쓰면 한쪽 시각, 시장과 평균하면
// 양쪽의 약점을 보완하는 ensemble 효과.
//
// blend ratio:
//  - 시장이 매우 정확하지만 — 우리 모델이 추가로 잡는 신호 (Elo·홈원정·폼) 도 가치
//  - 50/50 보다 시장 60% / 모델 40% 가 일반적으로 더 좋다고 알려짐
//  - 매우 자신감 있는 시장 픽 (≥70%) 일 때만 시장 비중↑

const DEFAULT_MARKET_WEIGHT = 0.6;

// 리그별 시장 가중 오버라이드 — 2026-07-02 walk-forward(70/30): MLB 는 시장 비중을 실효
// 0.75 로 올리면 test +2.4~6.5%p·Brier 개선 (calibration 교란을 분리한 baseline 에서도 생존,
// 곡선이 w↑ 방향 단조). NPB 는 역방향(악화)이라 미적용, KBO 는 표본<200 보류.
// 오버라이드는 호출자 지정 marketWeight 보다 우선 — 경로(위젯 0.4 vs 채점 0.6) 간 MLB 불일치 통일.
//
// 2026-09-05 MLB 0.75 → 0.85. 근거는 "우리 예측 vs 그 시점에 실제로 쓸 수 있었던 시장" 비교.
//   오프닝 배당이 우리 예측보다 **먼저** 잡힌 235경기(유일하게 공정한 부분집합)에서
//   우리 51.5% · 오프닝 배당 55.7%, 픽이 갈린 24건은 시장 17 대 우리 7(z=2.04).
//   전체 1,369경기(오프닝이 대개 우리 예측보다 늦음)에서도 우리 54.5% · 오프닝 55.2% 로 방향은 같다.
//   세 방식 어디서도 우리 잔여 신호가 시장을 이기지 못해, 모델 비중을 0.25 → 0.15 로 줄인다.
// ⚠ 이 비교를 **저장된 marketHome(=마감 배당)** 으로 하면 안 된다. 저장 배당의 97%가 예측
//   이후 갱신된 값이라 우리가 못 쓴 정보로 우리를 때리는 셈이고, 그 방식은 시장 우위를
//   +1.8%p 로 부풀린다(같은 표본 실측). 같은 이유로 저장 pred 에서 블렌드를 역산하는
//   스윕(w별 최적점 찾기)도 무효다 — 역산의 전제인 "그때 그 시장"이 남아 있지 않다.
// ⚠ 부수효과: valueGap = 블렌드확률 − 시장확률 = (1−w)×(모델−시장) 이라 w 를 올리면 폭이 줄어
//   MLB Value Bet 은 사실상 사라진다. 현행 MLB 밸류벳 적중률이 48%(기준선 53% 미만)라
//   잃을 게 없다고 보고 진행했지만, 되살리려면 블렌드 이전 모델 확률로 gap 을 재정의해야 한다.
const LEAGUE_MARKET_WEIGHT: Record<string, number> = {
  MLB: 0.85,
};

/** 리그 기본 시장 블렌드 가중 — member-bot 시장 손잡이의 100% 기준점 (blendWithMarket 과 동일 소스). */
export function getDefaultMarketWeight(league?: string): number {
  return (league && LEAGUE_MARKET_WEIGHT[league]) || DEFAULT_MARKET_WEIGHT;
}

export interface MarketProb {
  home: number;
  draw?: number | null;
  away: number;
  bookmakers?: number | null;
}

/**
 * 우리 winProb + 시장 implied probability 가중 평균.
 * 시장 데이터 없으면 우리 winProb 그대로 반환.
 */
export function blendWithMarket(
  ours: { home: number; draw: number; away: number },
  market: MarketProb | null | undefined,
  opts?: { marketWeight?: number; league?: string },
): { home: number; draw: number; away: number; blended: boolean } {
  if (!market || market.home == null || market.away == null) {
    return { ...ours, blended: false };
  }
  // 시장이 너무 적은 북메이커만 보고 있으면 신뢰도↓ (3개 미만이면 weight 절반)
  let w =
    (opts?.league && LEAGUE_MARKET_WEIGHT[opts.league]) ||
    (opts?.marketWeight ?? DEFAULT_MARKET_WEIGHT);
  if (market.bookmakers != null && market.bookmakers < 3) w *= 0.5;

  const mDraw = market.draw ?? 0;
  const home = ours.home * (1 - w) + market.home * w;
  const away = ours.away * (1 - w) + market.away * w;
  const draw = ours.draw * (1 - w) + mDraw * w;

  // 정규화 (시장 + 모델 합이 정확히 1 안 될 수 있음 — vig 제거 오차)
  const sum = home + draw + away;
  return {
    home: home / sum,
    draw: draw / sum,
    away: away / sum,
    blended: true,
  };
}
