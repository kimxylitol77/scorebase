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
const LEAGUE_MARKET_WEIGHT: Record<string, number> = {
  MLB: 0.75,
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
