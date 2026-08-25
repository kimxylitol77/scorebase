// 0-0 오확정 가드 — ts 캐시 완주 판정 고정. 케이스는 전부 production 실측 score 값.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tsFinishEvidence } from "./finish-evidence";

// 하키: [tsId, status_id, ?, { ft, p1... }]
const hockey = (statusId: number, periods: Record<string, number[]>) =>
  ["pxwrx0bndzxzryk", statusId, 0, periods];
// 야구: 이닝은 문자열
const baseball = (statusId: number, periods: Record<string, string[]>) =>
  ["3glrw5s91e05rdy", statusId, 2, periods];
// 축구: [tsId, status_id, [홈], [원정], kickoff, ""]
const soccer = (statusId: number, home: number[], away: number[]) =>
  ["965mkyhkj30dr1g", statusId, home, away, 0, ""];

test("하키 P1 고착 0-0 은 완주가 아니다 — 2026-08-25 #7179267", () => {
  assert.equal(
    tsFinishEvidence("HOCKEY_FRIENDLY", hockey(30, { ft: [0, 0], p1: [0, 0] })),
    "UNPLAYED",
  );
});

test("하키 3피리어드가 다 있으면 완주 — 0-0 이어도 정당한 결과", () => {
  assert.equal(
    tsFinishEvidence("HOCKEY_FRIENDLY", hockey(100, { ft: [0, 4], p1: [0, 3], p2: [0, 0], p3: [0, 1] })),
    "COMPLETED",
  );
  // ts 가 종료 스탬프를 놓쳐 P3(32) 로 남아도 피리어드가 다 찼으면 완주로 본다
  assert.equal(
    tsFinishEvidence("HOCKEY_FRIENDLY", hockey(32, { ft: [0, 0], p1: [0, 0], p2: [0, 0], p3: [0, 0] })),
    "COMPLETED",
  );
});

test("하키 연장·승부차기 종료 코드도 완주", () => {
  assert.equal(tsFinishEvidence("NHL", hockey(105, { ft: [2, 2], ot: [2, 3], p1: [0, 1], p2: [1, 0], p3: [1, 1] })), "COMPLETED");
  assert.equal(tsFinishEvidence("NHL", hockey(110, {})), "COMPLETED");
});

test("하키 연기·취소 코드는 피리어드와 무관하게 미진행", () => {
  assert.equal(tsFinishEvidence("NHL", hockey(14, { ft: [0, 0], p1: [0, 0], p2: [0, 0], p3: [0, 0] })), "UNPLAYED");
  assert.equal(tsFinishEvidence("NHL", hockey(16, {})), "UNPLAYED");
});

test("야구 취소(14) 는 미진행 — KBO·NPB 16건이 FINISHED 0-0 으로 굳어 있던 유형", () => {
  assert.equal(tsFinishEvidence("KBO", baseball(14, {})), "UNPLAYED");
  assert.equal(tsFinishEvidence("NPB", baseball(19, {})), "UNPLAYED");
});

test("야구 9이닝 종료는 완주, 이닝이 모자라면 미진행", () => {
  const nine: Record<string, string[]> = { e: ["0", "0"], h: ["12", "6"], ft: ["0", "0"] };
  for (let i = 1; i <= 9; i++) nine[`p${i}`] = ["0", "0"];
  assert.equal(tsFinishEvidence("KBO", baseball(100, nine)), "COMPLETED");
  assert.equal(tsFinishEvidence("KBO", baseball(415, { ft: ["0", "0"], p1: ["0", "0"], p2: ["0", "0"] })), "UNPLAYED");
});

test("축구는 종료(8) 만 완주 확정 — 나머지는 판정 불가로 기존 동작 유지", () => {
  assert.equal(tsFinishEvidence("EPL", soccer(8, [0, 0, 0, 2, 6, 0, 0], [0, 0, 0, 3, 4, 0, 0])), "COMPLETED");
  // 2026-08-22 FA컵 실측: score 배열이 전부 0 인데 incidents 에 45'/90' 마커가 있던 진짜 0-0.
  // "전부 0 이면 미진행" 규칙을 쓰면 이 4건이 연기로 지워진다.
  assert.equal(tsFinishEvidence("FA_CUP", soccer(9, [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])), "UNKNOWN");
  assert.equal(tsFinishEvidence("UEL", soccer(4, [0, 0, 0, 0, 8, 0, 0], [0, 0, 0, 1, 4, 0, 0])), "UNKNOWN");
  assert.equal(tsFinishEvidence("INTL_FRIENDLY", soccer(1, [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])), "UNKNOWN");
});

test("축구 취소(12) 만 미진행", () => {
  assert.equal(tsFinishEvidence("EPL", soccer(12, [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0])), "UNPLAYED");
});

test("캐시가 없거나 구조가 다르면 판정 불가 — 연기로 밀지 않는다", () => {
  assert.equal(tsFinishEvidence("NHL", null), "UNKNOWN");
  assert.equal(tsFinishEvidence("NHL", undefined), "UNKNOWN");
  assert.equal(tsFinishEvidence("NHL", {}), "UNKNOWN");
  assert.equal(tsFinishEvidence("NHL", ["id"]), "UNKNOWN");
  // 피리어드 자리가 객체가 아님 (농구식 배열 등)
  assert.equal(tsFinishEvidence("NHL", ["id", 30, 0, [1, 2, 3]]), "UNKNOWN");
});

test("대상 밖 종목은 판정하지 않는다 — 0-0 자체가 성립하지 않는다", () => {
  assert.equal(tsFinishEvidence("NBA", ["id", 2, 0, [10, 20], [15, 18]]), "UNKNOWN");
  assert.equal(tsFinishEvidence("UFC", ["id", 2, 0, {}]), "UNKNOWN");
});
