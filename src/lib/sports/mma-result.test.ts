// UFC 승리 방법 라벨 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { mmaResultLabel } from "./mma-result";

test("피니시는 라운드 + 한글 방법, 세부가 붙은 서브미션도 한글화", () => {
  assert.equal(mmaResultLabel({ method: "KO/TKO", round: 2, clock: null }), "2R · KO/TKO");
  assert.equal(mmaResultLabel({ method: "Submission (Rear Naked Choke)", round: 1, clock: null }), "1R · 서브미션");
});

test("판정은 라운드 생략, 방법 없으면 null", () => {
  assert.equal(mmaResultLabel({ method: "Decision - Split", round: 3, clock: null }), "판정 (분할)");
  assert.equal(mmaResultLabel({ method: null, round: null, clock: null }), null);
});

test("영어판 라벨", () => {
  assert.equal(mmaResultLabel({ method: "Submission (Rear Naked Choke)", round: 2, clock: null }, "en"), "2R · Submission");
  assert.equal(mmaResultLabel({ method: "Decision - Unanimous", round: 3, clock: null }, "en"), "Decision (unanimous)");
});
