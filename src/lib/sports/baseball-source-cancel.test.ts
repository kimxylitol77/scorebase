import assert from "node:assert/strict";
import test from "node:test";
import { hasProtectedResult, isFutureSourceCancel } from "./baseball-source-cancel";

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

test("야구의 0-0 종료는 지켜야 할 결과가 아니다 — 취소 경기의 잔여값", () => {
  // 2026-08-25 실측: FINISHED 인데 소스가 연기인 야구 23건이 전부 0-0 이었다.
  for (const lg of ["KBO", "NPB", "MLB", "LMB", "CPBL"]) {
    assert.equal(hasProtectedResult(lg, 0, 0), false, lg);
  }
});

test("야구도 득점이 있으면 보호한다 — 중단 경기의 점수는 지운다", () => {
  // KBO #2218 (0-1, ABD 중단) 유형. 소스가 연기라고 해도 이건 덮지 않는다.
  assert.equal(hasProtectedResult("KBO", 0, 1), true);
  assert.equal(hasProtectedResult("KBO", 3, 0), true);
});

test("축구의 0-0 은 정상 결과라 보호한다", () => {
  // af 가 종료 경기에 PST/NS 를 주는 기벽이 실측돼 있어(SUI_CUP #5801019) 뒤집으면 안 된다.
  assert.equal(hasProtectedResult("EPL", 0, 0), true);
  assert.equal(hasProtectedResult("FA_CUP", 0, 0), true);
  assert.equal(hasProtectedResult("NHL", 0, 0), true);
});

test("점수가 아예 없으면 종목과 무관하게 보호 대상이 아니다", () => {
  assert.equal(hasProtectedResult("KBO", null, null), false);
  assert.equal(hasProtectedResult("EPL", null, null), false);
  assert.equal(hasProtectedResult("EPL", undefined, undefined), false);
});

test("한쪽만 있는 반쪽 점수는 보호한다 — 수집 중간 상태를 지우지 않는다", () => {
  assert.equal(hasProtectedResult("KBO", 0, null), true);
  assert.equal(hasProtectedResult("EPL", null, 2), true);
});
