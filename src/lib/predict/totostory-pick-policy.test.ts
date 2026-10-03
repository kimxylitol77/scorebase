import test from "node:test";
import assert from "node:assert/strict";
import { compareTotoStoryCandidates, hasVerifiedPickMarket, SEVERE_PICK_UNCERTAINTY_RE } from "./totostory-pick-policy";

const now = new Date("2026-10-03T03:00:00Z");
const valid = { comparable: true, odds: 1.8, bookmakers: 3, updatedAt: now, now };

test("all markets require verified, fresh, finite odds", () => {
  assert.equal(hasVerifiedPickMarket(valid), true);
  for (const change of [
    { comparable: false }, { odds: null }, { odds: 1.44 }, { odds: NaN }, { odds: Infinity },
    { bookmakers: 2 }, { bookmakers: null }, { updatedAt: null },
    { updatedAt: new Date("invalid") }, { updatedAt: new Date(now.getTime() + 1) },
    { updatedAt: new Date(now.getTime() - 48 * 3600000 - 1) },
  ]) assert.equal(hasVerifiedPickMarket({ ...valid, ...change }), false, JSON.stringify(change));
  assert.equal(hasVerifiedPickMarket({ ...valid, odds: 1.45, updatedAt: new Date(now.getTime() - 48 * 3600000) }), true);
});

test("market and odds bonuses cannot outrank a stronger candidate", () => {
  const base = { startTime: now.toISOString(), matchId: 1 };
  const rows = [
    { ...base, market: "HANDICAP", confidenceScore: 70 },
    { ...base, market: "OU", confidenceScore: 71 },
    { ...base, market: "1X2", confidenceScore: 72 },
  ];
  assert.deepEqual(rows.sort(compareTotoStoryCandidates).map(row => row.market), ["1X2", "OU", "HANDICAP"]);
});

test("uncertainty applies to match context, including handicaps and totals", () => {
  for (const reason of ["선발 미발표", "라인업 정보 없음", "정보 부족", "출전 미정"]) {
    assert.equal(SEVERE_PICK_UNCERTAINTY_RE.test(reason), true);
  }
  assert.equal(SEVERE_PICK_UNCERTAINTY_RE.test("홈 성적과 최근 득실 우세"), false);
});
