// 시즌 시뮬 — 라인업 점수를 승률로 바꿔 정규시즌을 한 번 돌린다. 게임 시드로 결정적이라 같은 판은 늘 같은 성적.
import { MODES, type DraftMode } from "./modes";
import { makeRng } from "./rng";

export interface SeasonRecord {
  w: number;
  d: number;
  l: number;
  games: number;
  perfect: boolean; // 전승
  unbeaten: boolean; // 무패 (무승부 있는 종목)
}

/**
 * 승률 — 카드가 전부 리그 평균 이상 선수라 아무렇게나 짜도 약팀은 아니다. 바닥 3할, 기준선 중앙값이면 6할,
 * 99백분위면 .970. 전승은 기준선 최고 기록을 훌쩍 넘겨야 나온다 (82-0 류의 "불가능에 가까운 목표").
 */
export function winProb(total: number, quantiles: number[]): number {
  const mid = quantiles[50];
  const top = quantiles[99];
  const z = (total - mid) / Math.max(0.1, top - mid);
  return 0.3 + 0.7 / (1 + Math.exp(-(-0.3 + 3.4 * z)));
}

export function simulateSeason(mode: DraftMode, total: number, quantiles: number[], seed: number): SeasonRecord {
  const { games, draws } = MODES[mode];
  const p = winProb(total, quantiles);
  // 무승부 — 전력이 팽팽할수록 많다 (최대 26%)
  const pd = draws ? 0.26 * (1 - Math.abs(2 * p - 1)) : 0;
  const pw = p * (1 - pd);
  const rng = makeRng((seed ^ 0x5eed5ea5) >>> 0);
  let w = 0;
  let d = 0;
  for (let i = 0; i < games; i++) {
    const r = rng();
    if (r < pw) w++;
    else if (r < pw + pd) d++;
  }
  const l = games - w - d;
  return { w, d, l, games, perfect: w === games, unbeaten: l === 0 };
}

export function recordLabel(r: SeasonRecord, draws: boolean): string {
  return draws ? `${r.w}승 ${r.d}무 ${r.l}패` : `${r.w}승 ${r.l}패`;
}
