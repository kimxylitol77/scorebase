// 일정 탭 보조 — 라운드 없는 리그(NHL)의 정규시즌 주차 계산.
import test from "node:test";
import assert from "node:assert/strict";
import { seasonWeek, seasonWeekRange } from "./fixture-rounds";

// NHL 2026-27 개막 — 현지 9/29 17:00 ET = 한국시간 9/30 06:00
const opening = new Date("2026-09-29T21:00:00Z");

test("주차는 개막일(한국시간) 부터 7일 단위", () => {
  assert.equal(seasonWeek(opening, opening), 1);
  assert.equal(seasonWeek(new Date("2026-10-06T14:00:00Z"), opening), 1); // 한국시간 10/6 23:00
  assert.equal(seasonWeek(new Date("2026-10-06T16:00:00Z"), opening), 2); // 한국시간 10/7 01:00
  assert.equal(seasonWeek(new Date("2026-09-25T00:00:00Z"), opening), 1); // 개막 전은 1주차로 붙인다(프리시즌은 호출부가 따로 묶음)
});

test("주차 날짜 범위 라벨", () => {
  assert.equal(seasonWeekRange(1, opening), "9/30~10/6");
  assert.equal(seasonWeekRange(2, opening), "10/7~10/13");
});
