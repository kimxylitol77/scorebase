import assert from "node:assert/strict";
import test from "node:test";
import { isFutureSourceCancel } from "./baseball-source-cancel";

const NOW = new Date("2026-07-29T03:00:00Z"); // 12:00 KST
const future = (days: number) =>
  new Date(NOW.getTime() + days * 86400 * 1000);
const past = (days: number) => future(-days);

test("미래 CANC 는 취소로 보지 않는다 — NPB 9월 71건 실사고", () => {
  // 실측 최단이 43일 앞이었다. 하루 앞도 규칙 대상 — 킥오프 전이면 CANC 를 안 믿는다.
  for (const d of [43, 7, 1, 0.5]) {
    assert.equal(isFutureSourceCancel("CANC", future(d), NOW), true, `${d}일 앞`);
  }
});

test("킥오프가 지난 CANC 는 존중한다 — 진짜 당일 취소", () => {
  for (const d of [0.1, 1, 30]) {
    assert.equal(isFutureSourceCancel("CANC", past(d), NOW), false, `${d}일 전`);
  }
});

test("CANC 외의 연기 신호는 미래여도 그대로 존중한다", () => {
  // POST(연기)·ABD(미성립)·SUSP(중단)는 실제 신호 — 기벽이 관측된 적 없다.
  for (const s of ["POST", "ABD", "SUSP"]) {
    assert.equal(isFutureSourceCancel(s, future(43), NOW), false, s);
  }
});

test("정상 status 는 대상이 아니다", () => {
  for (const s of ["NS", "FT", "IN1", "AOT", "CANC_FT"]) {
    assert.equal(isFutureSourceCancel(s, future(43), NOW), false, s);
  }
});

test("대소문자를 가리지 않는다", () => {
  assert.equal(isFutureSourceCancel("canc", future(43), NOW), true);
  assert.equal(isFutureSourceCancel("Canc", future(43), NOW), true);
});

test("startTime·status 가 없으면 판정하지 않는다 — 미래 여부를 알 수 없다", () => {
  assert.equal(isFutureSourceCancel("CANC", null, NOW), false);
  assert.equal(isFutureSourceCancel("CANC", undefined, NOW), false);
  assert.equal(isFutureSourceCancel(null, future(43), NOW), false);
  assert.equal(isFutureSourceCancel(undefined, future(43), NOW), false);
});

test("경계 — 킥오프 순간은 미래가 아니다", () => {
  assert.equal(isFutureSourceCancel("CANC", NOW, NOW), false);
  assert.equal(
    isFutureSourceCancel("CANC", new Date(NOW.getTime() + 1), NOW),
    true,
  );
});
