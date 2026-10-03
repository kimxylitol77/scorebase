// ts 실적 없는 리그 고르기 — 순서 유지·실적 있는 리그 제외
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTsInactive } from "./ts-coverage-fallback";

test("실적 집합에 없는 후보만 순서대로", () => {
  assert.deepEqual(pickTsInactive(["EPL", "UAE_PL", "INDIA_ISL", "SERIE_A"], new Set(["EPL", "SERIE_A"])), ["UAE_PL", "INDIA_ISL"]);
  assert.deepEqual(pickTsInactive([], new Set(["EPL"])), []);
  assert.deepEqual(pickTsInactive(["EPL"], new Set()), ["EPL"]);
});
