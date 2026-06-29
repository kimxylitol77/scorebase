// 드림팀 티어 정의 — 티어별 예산(€M) · 승급 해금 누적 자금 · 승급 순서

export interface Tier {
  key: string;
  name: string;
  budget: number; // €M (스쿼드 시장가치 상한)
  unlock: number; // 이 티어 해금에 필요한 누적 자금(€M). amateur=0
}

// budget = 스쿼드(선발 11 + 벤치 7 = 18명) 가치 상한 겸 승급 기준(구단가치 ≥ 다음 티어 budget).
export const TIERS: Record<string, Tier> = {
  amateur: { key: "amateur", name: "아마추어", budget: 25, unlock: 0 },
  local: { key: "local", name: "동네축구", budget: 65, unlock: 30 },
  youth: { key: "youth", name: "유소년", budget: 130, unlock: 90 },
  semipro: { key: "semipro", name: "세미프로", budget: 240, unlock: 200 },
  pro: { key: "pro", name: "프로", budget: 360, unlock: 450 },
  worldclass: { key: "worldclass", name: "월드클래스", budget: 500, unlock: 900 },
};

export const TIER_ORDER = ["amateur", "local", "youth", "semipro", "pro", "worldclass"];

export function nextTier(tier: string): Tier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? TIERS[TIER_ORDER[i + 1]] : null;
}
