// 드래프트 라인업 채점 — 기여도 합 + 보너스 4종 + 반지
import type { PoolCard, Pos } from "./types";

export const SLOTS: Pos[] = ["G", "G", "F", "F", "C"];
export const OFF_SCALE = 2.2;
export const DEF_SCALE = 1.3;

export interface Score {
  off: number;
  def: number;
  impact: number;
  full: number;
  balance: number;
  durability: number;
  lockdown: number;
  bonus: number;
  total: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** 카드들을 가드2·포워드2·센터1 슬롯에 배치. 못 넣은 카드는 slot -1. 최대한 많이 채우는 배치를 찾는다. */
export function assignSlots(cards: Array<Pick<PoolCard, "pos">>): number[] {
  let best: number[] = cards.map(() => -1);
  let bestFilled = -1;
  const cur: number[] = cards.map(() => -1);
  const taken = SLOTS.map(() => false);
  const walk = (i: number, filled: number) => {
    if (i === cards.length) {
      if (filled > bestFilled) {
        bestFilled = filled;
        best = [...cur];
      }
      return;
    }
    for (let s = 0; s < SLOTS.length; s++) {
      if (taken[s] || !cards[i].pos.includes(SLOTS[s])) continue;
      if (s > 0 && SLOTS[s - 1] === SLOTS[s] && !taken[s - 1]) continue; // 같은 포지션 슬롯은 앞에서부터
      taken[s] = true;
      cur[i] = s;
      walk(i + 1, filled + 1);
      taken[s] = false;
      cur[i] = -1;
    }
    walk(i + 1, filled);
  };
  walk(0, 0);
  return best;
}

export function isFullLineup(cards: Array<Pick<PoolCard, "pos">>): boolean {
  return cards.length === SLOTS.length && assignSlots(cards).every((s) => s >= 0);
}

export function scoreLineup(cards: PoolCard[], lockdownAt: number): Score {
  const off = cards.reduce((a, c) => a + c.off, 0);
  const def = cards.reduce((a, c) => a + c.def, 0);
  const full = isFullLineup(cards) ? 3 : 0;
  // 균형 — 공격·수비를 같은 눈금으로 놓고 작은 쪽÷큰 쪽. 한쪽이 0 이하면 최저.
  const o = off / OFF_SCALE;
  const d = def / DEF_SCALE;
  const balance = cards.length === 0 ? 0 : o <= 0 || d <= 0 ? -2 : -2 + 4 * (Math.min(o, d) / Math.max(o, d));
  const durability = cards.length ? (cards.reduce((a, c) => a + c.dur, 0) / cards.length - 0.5) * 3 : 0;
  const lockdown = def > lockdownAt ? 4 : 0;
  const bonus = full + balance + durability + lockdown;
  return {
    off: r1(off),
    def: r1(def),
    impact: r1(off + def),
    full,
    balance: r1(balance),
    durability: r1(durability),
    lockdown,
    bonus: r1(bonus),
    total: r1(off + def + bonus),
  };
}

/** 모의 분포(길이 101) 대비 백분위 0~100 */
export function percentileOf(total: number, quantiles: number[]): number {
  let p = 0;
  for (let i = 0; i < quantiles.length; i++) if (total >= quantiles[i]) p = i;
  return p;
}

const RING_CUTS = [10, 28, 45, 62, 78, 90];
export function ringsOf(percentile: number): number {
  return RING_CUTS.filter((c) => percentile >= c).length;
}
