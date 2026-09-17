// 투표 랭킹 집계 테스트 — 최소 표본·연속 적중·수익률·정렬
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateVotes, type VoteInput } from "./vote-ranking";

const v = (userId: string, correct: boolean, day: number, odds: number | null = 2, clv: number | null = null, market = "1X2"): VoteInput => ({ userId, market, correct, pickOdds: odds, clv, at: new Date(Date.UTC(2026, 8, day)) });

test("최소 3표, 연속 적중은 최신 순으로 끊길 때까지, 수익률·CLV·시장별 집계", () => {
  const rows = aggregateVotes([
    v("a", true, 1), v("a", false, 2), v("a", true, 3, 2.5, 0.05), v("a", true, 4, 1.5, -0.01, "OU"),
    v("b", true, 1), v("b", true, 2), // 2표 → 제외
    v("c", false, 1, 2), v("c", false, 2, 2), v("c", true, 3, 3),
  ]);
  assert.deepEqual(rows.map((r) => r.userId), ["a", "c"]);
  const a = rows[0];
  assert.equal(a.total, 4);
  assert.equal(a.hit, 3);
  assert.equal(a.streak, 2);
  assert.equal(a.roi.evaluated, 4);
  assert.ok(Math.abs(a.avgClv! - 2) < 1e-9);
  assert.equal(a.clvN, 2);
  assert.deepEqual(a.markets.find((m) => m.market === "OU"), { market: "OU", total: 1, hit: 1 });
  assert.equal(rows[1].streak, 1);
  assert.ok(Math.abs(rows[1].roi.units - 0) < 1e-9); // -1 -1 +2
});
