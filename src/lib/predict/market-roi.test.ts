// 마켓별 수익률 배지 — 기준선이 같은 내기만 정산하는지 고정.
import test from "node:test";
import assert from "node:assert/strict";
import { hcBetOf, ouBetOf } from "./market-roi";

const ou = (x: Partial<Parameters<typeof ouBetOf>[0]>) => ({
  homeScore: 2, awayScore: 1, predOverPick: "OVER", oddsTotalLine: 2.5, oddsOver: 1.9, oddsUnder: 1.95, ...x,
});

test("오버언더 — 시장 기준선이 모델과 같으면 정산", () => {
  assert.deepEqual(ouBetOf(ou({}), 2.5), { odds: 1.9, won: true });
  assert.deepEqual(ouBetOf(ou({ predOverPick: "UNDER" }), 2.5), { odds: 1.95, won: false });
});

test("오버언더 — 기준선이 다르면 다른 내기라 제외, 총점이 기준선과 같으면 무효", () => {
  assert.equal(ouBetOf(ou({ oddsTotalLine: 3.5 }), 2.5), null);
  assert.equal(ouBetOf(ou({ homeScore: 5, awayScore: 3, oddsTotalLine: 8 }), 8), null);
  assert.equal(ouBetOf(ou({ predOverPick: null }), 2.5), null);
});

const books = (...hl: number[]) => ({ books: hl.map((h) => ({ hl: h })) });

const hc = (x: Partial<Parameters<typeof hcBetOf>[0]>) => ({
  homeScore: 3, awayScore: 1, predHcPick: "HOME", predHcLine: 1.5,
  oddsHcLine: 1.5, oddsHcHome: 2.1, oddsHcAway: 1.75, oddsBookmakers: books(-1.5, -1.5),
  oddsHome: null as number | null, oddsAway: null as number | null, ...x,
});

test("핸디캡 — 홈이 같은 기준선으로 핸디를 줄 때만 정산", () => {
  assert.deepEqual(hcBetOf(hc({})), { odds: 2.1, won: true });
  assert.deepEqual(hcBetOf(hc({ predHcPick: "AWAY" })), { odds: 1.75, won: false });
});

test("핸디캡 — 원정이 핸디를 주거나 기준선이 다르면 제외", () => {
  assert.equal(hcBetOf(hc({ oddsBookmakers: books(1.5, 1.5) })), null);
  assert.equal(hcBetOf(hc({ oddsHcLine: 2.5, oddsBookmakers: books(-2.5) })), null);
  assert.equal(hcBetOf(hc({ predHcPick: null })), null);
});

test("핸디캡 — 점수차가 기준선과 같으면 무효", () => {
  assert.equal(hcBetOf(hc({ predHcLine: 1, oddsHcLine: 1, oddsBookmakers: books(-1), homeScore: 2, awayScore: 1 })), null);
});
