// 드림팀 티어 정의 — 티어별 예산(€M)과 승급 순서

export interface Tier {
  key: string;
  name: string;
  budget: number; // €M
}

export const TIERS: Record<string, Tier> = {
  amateur: { key: "amateur", name: "아마추어", budget: 15 },
  local: { key: "local", name: "동네축구", budget: 40 },
  youth: { key: "youth", name: "유소년", budget: 80 },
  semipro: { key: "semipro", name: "세미프로", budget: 150 },
  pro: { key: "pro", name: "프로", budget: 220 },
  worldclass: { key: "worldclass", name: "월드클래스", budget: 300 },
};

export const TIER_ORDER = ["amateur", "local", "youth", "semipro", "pro", "worldclass"];
