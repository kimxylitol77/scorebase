// 고확신 픽 2~3레그 자동 조합 — /picks/strong "오늘의 조합" 카드. 순수 함수(DB·저장 없음).
// 레그는 이미 채점되는 픽이라 조합 결과는 레그 결과의 AND. 확률은 독립 가정의 곱(같은 경기 두 마켓은 상관이라 절대 안 묶음).
// 리그·마켓 중복은 우선 회피하되 부족하면 완화(더블찬스 편중 실측) — 경기 중복만 절대 금지.

import type { StrongMarket } from "./strong-picks";

export interface ParlayLeg {
  matchId: number;
  league: string;
  market: StrongMarket;
  /** 화면 표기 픽("아틀레틱 빌바오 승 또는 무승부") */
  pick: string;
  detail?: string;
  prob: number;
  /** 채점 결과 — null 이면 아직 */
  correct: boolean | null;
  home: string;
  away: string;
  startTime: Date;
}

export interface Parlay {
  key: string;
  label: string;
  legs: ParlayLeg[];
  /** 모델 확신도의 곱 */
  prob: number;
  /** 마켓별 실측 적중률의 곱(0~1) — 실측이 없는 마켓이 있으면 null */
  expected: number | null;
  /** 전 레그 적중 → true, 한 레그라도 빗나감 → false, 아니면 null */
  correct: boolean | null;
}

/** 그리디 — 확신도 내림차순으로 훑으며 제약을 만족하는 레그를 채운다. 못 채우면 제약을 한 단계씩 푼다. */
function build(pool: ParlayLeg[], size: number, exclude: Set<number>): ParlayLeg[] | null {
  const modes: Array<{ league: boolean; market: boolean }> = [
    { league: true, market: true },
    { league: true, market: false },
    { league: false, market: false },
  ];
  for (const mode of modes) {
    const out: ParlayLeg[] = [];
    const matches = new Set<number>(exclude);
    const leagues = new Set<string>();
    const markets = new Set<string>();
    for (const leg of pool) {
      if (matches.has(leg.matchId)) continue;
      if (mode.league && leagues.has(leg.league)) continue;
      if (mode.market && markets.has(leg.market)) continue;
      out.push(leg);
      matches.add(leg.matchId);
      leagues.add(leg.league);
      markets.add(leg.market);
      if (out.length === size) return out;
    }
  }
  return null;
}

function judge(legs: ParlayLeg[]): boolean | null {
  if (legs.some((l) => l.correct === false)) return false;
  if (legs.every((l) => l.correct === true)) return true;
  return null;
}

function finish(key: string, label: string, legs: ParlayLeg[], rateByMarket: Partial<Record<StrongMarket, number>>): Parlay {
  const rates = legs.map((l) => rateByMarket[l.market]);
  return {
    key,
    label,
    legs,
    prob: legs.reduce((p, l) => p * l.prob, 1),
    expected: rates.every((r): r is number => r != null && r > 0) ? rates.reduce((p, r) => p * r, 1) : null,
    correct: judge(legs),
  };
}

/**
 * 조합 카드용 후보. A=최고 2레그, B=최고 3레그, C=B 와 경기가 안 겹치는 3레그.
 * @param rateByMarket 마켓별 실측 적중률(0~1) — /picks/strong 의 acc.byMarket.rate/100
 */
export function buildParlays(legs: ParlayLeg[], rateByMarket: Partial<Record<StrongMarket, number>>): Parlay[] {
  const pool = [...legs].sort((a, b) => b.prob - a.prob);
  const out: Parlay[] = [];
  const two = build(pool, 2, new Set());
  if (two) out.push(finish("A", "가장 자신 있는 2레그", two, rateByMarket));
  const three = build(pool, 3, new Set());
  if (three) {
    out.push(finish("B", "3레그", three, rateByMarket));
    const alt = build(pool, 3, new Set(three.map((l) => l.matchId)));
    if (alt) out.push(finish("C", "다른 경기로 짠 3레그", alt, rateByMarket));
  }
  return out;
}
