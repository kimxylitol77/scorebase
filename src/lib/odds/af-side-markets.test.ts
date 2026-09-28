// af 부가 마켓(BTTS·더블찬스) 평균 계산과 patch 생성 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { sideMarketsFromAfBookmakers, sideMarketsPatch } from "./af-side-markets";

test("북메이커 평균 — BTTS·DC 모두 있을 때", () => {
  const s = sideMarketsFromAfBookmakers([
    {
      bets: [
        { id: 8, values: [{ value: "Yes", odd: "1.60" }, { value: "No", odd: "2.20" }] },
        { id: 12, values: [{ value: "Home/Draw", odd: "1.70" }, { value: "Home/Away", odd: "1.30" }, { value: "Draw/Away", odd: "1.30" }] },
      ],
    },
    { bets: [{ id: 8, values: [{ value: "Yes", odd: "1.50" }, { value: "No", odd: "2.40" }] }] },
  ]);
  assert.equal(s.btts?.bookmakers, 2);
  assert.ok(Math.abs(s.btts!.yes - 1.55) < 1e-9);
  assert.ok(Math.abs(s.btts!.no - 2.3) < 1e-9);
  assert.equal(s.dc?.bookmakers, 1);
  assert.equal(s.dc?.oneX, 1.7);
});

test("한쪽 값이 빠진 북메이커는 제외, 없는 마켓은 patch 에서 빠진다", () => {
  const s = sideMarketsFromAfBookmakers([
    { bets: [{ id: 8, values: [{ value: "Yes", odd: "1.60" }] }, { id: 1, values: [] }] },
  ]);
  assert.equal(s.btts, null);
  assert.equal(s.dc, null);
  assert.deepEqual(sideMarketsPatch(s), {});
});

test("patch 는 있는 마켓만 담는다", () => {
  const p = sideMarketsPatch({ btts: { yes: 1.5, no: 2.5, bookmakers: 1 }, dc: null });
  assert.deepEqual(p, { oddsBttsYes: 1.5, oddsBttsNo: 2.5 });
});
