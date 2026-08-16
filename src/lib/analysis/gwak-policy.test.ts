import test from "node:test";
import assert from "node:assert/strict";
import { gwakConfidence, passesGwakPolicy, selectedHandicap } from "./gwak-policy";

const base = {
  sport: "baseball",
  league: "MLB",
  pick: "AWAY" as const,
  line: -1.5,
  statisticalProb: 0.58,
  contextProb: 0.65,
  hasComparableMarket: true,
  selectedOdds: 1.91,
  marketPick: "AWAY" as const,
  valueEdgePp: 4,
  movementPp: 1,
  reason: null,
};

test("선택 팀 기준 플러스 핸디캡만 통과한다", () => {
  assert.equal(selectedHandicap("AWAY", -1.5), 1.5);
  assert.equal(passesGwakPolicy({ ...base, market: "HANDICAP" }), true);
  assert.equal(passesGwakPolicy({ ...base, market: "HANDICAP", line: 1.5 }), false);
});

test("불확실성 문구와 저품질 배당을 차단한다", () => {
  assert.equal(passesGwakPolicy({ ...base, market: "HANDICAP", reason: "선발 미정" }), false);
  assert.equal(passesGwakPolicy({ ...base, market: "HANDICAP", selectedOdds: 1.4 }), false);
});

test("시장 없는 1X2는 더 높은 확률을 요구한다", () => {
  assert.equal(passesGwakPolicy({ ...base, market: "1X2", hasComparableMarket: false, selectedOdds: null }), false);
  assert.equal(passesGwakPolicy({
    ...base,
    market: "1X2",
    hasComparableMarket: false,
    selectedOdds: null,
    statisticalProb: 0.64,
    contextProb: 0.72,
  }), true);
});

test("신뢰도는 표시 범위를 벗어나지 않는다", () => {
  assert.equal(gwakConfidence(1, 1, 1), 88);
  assert.equal(gwakConfidence(0, 0, null), 60);
});
