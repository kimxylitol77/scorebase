// 점수 분포 기준선 — 찬스 없이 "기록이 좋아 보이는 선수"를 어렴풋이 알아보는 모의 플레이어 N판
// 눈썰미(NOISE)와 포지션 챙기는 비율(FIT_RATE)은 실제 결과에 맞춰 잡았다. 2026-09-27 첫 실사용 판
// (요키치 + 풀 라인업 +23.2점)이 처음 설정(NOISE 4·FIT 1.0)에서 하위 1% 로 나와 낮췄다 — 지금은 중앙값 근처.
import { boardFinished, indexOf, nextBoard, pick, startGame, type Pool } from "./engine";
import { makeRng } from "./rng";
import { assignSlots, scoreLineup, SLOTS } from "./scoring";
import type { PoolCard } from "./types";

const NOISE = 16;
const FIT_RATE = 0.7;

export function simulateBaseline(pool: Pool, games: number): { quantiles: number[]; lockdown: number } {
  const idx = indexOf(pool);
  const rng = makeRng(20260927);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const lineups: PoolCard[][] = [];
  for (let g = 0; g < games; g++) {
    let s = startGame(pool, "nba", Math.floor(rng() * 2 ** 31));
    while (!s.done) {
      const mine = s.picks.map((id) => idx.byId.get(id)!);
      const cards = s.board.cardIds.map((id) => idx.byId.get(id)!);
      // 사람은 대체로 풀 라인업을 노린다 — 빈 포지션에 들어가는 카드 안에서 고르되, 가끔은 무시한다
      const fits = cards.filter((c) => assignSlots([...mine, c]).every((x) => x >= 0));
      const choice = (fits.length && rng() < FIT_RATE ? fits : cards)
        .map((c) => ({ c, v: c.pts + c.reb * 0.5 + c.ast * 0.7 + gauss() * NOISE }))
        .sort((a, b) => b.v - a.v)[0].c;
      s = pick(pool, s, choice.id);
      if (boardFinished(s)) s = nextBoard(pool, s);
    }
    lineups.push(s.picks.map((id) => idx.byId.get(id)!));
  }
  const defs = lineups.map((l) => l.reduce((a, c) => a + c.def, 0)).sort((a, b) => a - b);
  const lockdown = Math.round(defs[Math.floor(defs.length * 0.9)] * 10) / 10;
  const totals = lineups.map((l) => scoreLineup(l, lockdown).total).sort((a, b) => a - b);
  const quantiles = Array.from({ length: 101 }, (_, i) => totals[Math.min(totals.length - 1, Math.floor((i / 100) * totals.length))]);
  return { quantiles, lockdown };
}

export const LINEUP_SIZE = SLOTS.length;
