// 점수 분포 기준선 — 찬스 없이 "이름값 높은 선수"를 어렴풋이 알아보는 모의 플레이어 N판
// 눈썰미(NOISE)와 포지션 챙기는 비율(FIT_RATE)은 실제 결과에 맞춰 잡았다. 2026-09-27 첫 실사용 판
// (요키치 + 풀 라인업 +23.2점)이 처음 설정에서 하위 1% 로 나와 낮췄다 — 지금은 중앙값 근처.
import { boardFinished, indexOf, nextBoard, pick, startGame, type Pool } from "./engine";
import { MODES, type DraftMode } from "./modes";
import { makeRng } from "./rng";
import { assignSlots, scoreLineup } from "./scoring";
import type { PoolCard } from "./types";

const NOISE = 2.3; // fame(z 점수) 단위
const FIT_RATE = 0.7;

export interface Baseline {
  quantiles: number[];
  lockdown: number;
  norm: { off: number; def: number };
}

/** fixedNorm 을 주면 균형 눈금을 그 값으로 고정한다 (농구는 출시 때 값 유지) */
export function simulateBaseline(pool: Pool, mode: DraftMode, games: number, fixedNorm?: Baseline["norm"]): Baseline {
  const idx = indexOf(pool);
  const slots = MODES[mode].slots;
  const rng = makeRng(20260927);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lineups: PoolCard[][] = [];
  for (let g = 0; g < games; g++) {
    let s = startGame(pool, mode, Math.floor(rng() * 2 ** 31));
    while (!s.done) {
      const mine = s.picks.map((id) => idx.byId.get(id)!);
      const cards = s.board.cardIds.map((id) => idx.byId.get(id)!);
      // 사람은 대체로 풀 라인업을 노린다 — 빈 포지션에 들어가는 카드 안에서 고르되, 가끔은 무시한다
      const fits = cards.filter((c) => assignSlots([...mine, c], slots).every((x) => x >= 0));
      const choice = (fits.length && rng() < FIT_RATE ? fits : cards)
        .map((c) => ({ c, v: c.fame + gauss() * NOISE }))
        .sort((a, b) => b.v - a.v)[0].c;
      s = pick(pool, s, choice.id);
      if (boardFinished(s)) s = nextBoard(pool, s);
    }
    lineups.push(s.picks.map((id) => idx.byId.get(id)!));
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const sum = (l: PoolCard[], k: "off" | "def") => l.reduce((a, c) => a + c[k], 0);
  const mean = (k: "off" | "def") => lineups.reduce((a, l) => a + sum(l, k), 0) / lineups.length;
  const norm = fixedNorm ?? { off: Math.max(0.1, r1(mean("off"))), def: Math.max(0.1, r1(mean("def"))) };
  const defs = lineups.map((l) => sum(l, "def")).sort((a, b) => a - b);
  const lockdown = r1(defs[Math.floor(defs.length * 0.9)]);
  const totals = lineups.map((l) => scoreLineup(l, { lockdown, norm }, slots).total).sort((a, b) => a - b);
  const quantiles = Array.from({ length: 101 }, (_, i) => totals[Math.min(totals.length - 1, Math.floor((i / 100) * totals.length))]);
  return { quantiles, lockdown, norm };
}
