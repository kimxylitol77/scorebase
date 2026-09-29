// 골리 승률 보정 테스트 — 추정 골리(KHL projected)는 NHL 기준 계수를 적용하지 않는다
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGoalieAdjustment } from "./goalie-adjust";

test("발표 골리는 보정하고, 한쪽이라도 추정 골리면 보정하지 않는다", () => {
  const home = { gaa: 2.1, savePctg: 0.925, gamesPlayed: 20 };
  const away = { gaa: 3.2, savePctg: 0.9, gamesPlayed: 20 };
  assert.equal(computeGoalieAdjustment(home, away).applied, true);
  assert.equal(computeGoalieAdjustment({ ...home, projected: true }, away).applied, false);
  assert.equal(computeGoalieAdjustment(home, { ...away, projected: true }).homeShift, 0);
});
