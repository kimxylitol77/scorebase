// 일정 탭 보조 — 라운드 없는 리그(NHL)의 정규시즌 주차 계산.
import test from "node:test";
import assert from "node:assert/strict";
import { preseasonCutoff, seasonWeek, seasonWeekRange } from "./fixture-rounds";

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

test("시범경기 끝 — 개막 전 사흘 공백을 경계로 본다 (2026 KBO)", () => {
  const d = (s: string) => new Date(`${s}T05:00:00Z`);
  const pre = ["2026-03-12", "2026-03-13", "2026-03-17", "2026-03-19", "2026-03-24"].map(d);
  const reg = ["2026-03-28", "2026-03-29", "2026-03-31", "2026-04-01"].map(d);
  const cut = preseasonCutoff([...pre, ...reg]);
  assert.equal(cut, Date.UTC(2026, 2, 28));
  assert.ok(pre.every((x) => x.getTime() + 9 * 3600_000 < cut!));
});

test("시범경기 끝 — 월요일 휴식 같은 하루 공백은 경계가 아니다 (NPB)", () => {
  const d = (s: string) => new Date(`${s}T09:00:00Z`);
  assert.equal(preseasonCutoff(["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-31", "2026-04-01"].map(d)), null);
});

test("시범경기 끝 — 시즌 중반의 긴 휴식(올스타)은 보지 않는다", () => {
  const d = (s: string) => new Date(`${s}T09:00:00Z`);
  // 개막 후 3주는 이틀 간격으로 경기, 그 뒤 7월에 일주일 휴식
  const early = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 2, 28 + i * 2, 9)));
  assert.equal(preseasonCutoff([...early, d("2026-07-10"), d("2026-07-17")]), null);
});
