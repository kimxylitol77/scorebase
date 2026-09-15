// 불펜 피로도 판정 순수함수 테스트 — 연투·과부하·휴식 경계와 KBO 이닝 표기 파싱
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPitcher, kboIpToInnings, windowDays, shiftDate, type PitcherUsage } from "./bullpen-fatigue";

const days = windowDays("2026-09-15"); // 09-09 … 09-14
const base = { pid: "1", name: "A", href: null };
const u = (date: string, pitches: number | null, tbf = 4): PitcherUsage => ({ date, pitches, innings: 1, tbf, er: 0 });

test("창은 기준일 전날까지 6일", () => {
  assert.deepEqual(days, ["2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"]);
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
});

test("이틀 연속 등판 = 연투 중(danger), 전날만 = caution, 없으면 rested", () => {
  assert.equal(assessPitcher(base, [u("2026-09-13", 15), u("2026-09-14", 12)], days).status, "danger");
  assert.equal(assessPitcher(base, [u("2026-09-14", 12)], days).status, "caution");
  assert.equal(assessPitcher(base, [u("2026-09-12", 12)], days).status, "rested");
  // 하루 건너뛰면 연투가 끊긴다
  assert.equal(assessPitcher(base, [u("2026-09-12", 12), u("2026-09-14", 12)], days).consecutiveDays, 1);
});

test("3일 투구수 40구 이상이면 과부하(MLB), 투구수 없으면 타자수 10 이상(KBO)", () => {
  const r = assessPitcher(base, [u("2026-09-12", 25), u("2026-09-14", 18)], days);
  assert.equal(r.status, "heavy");
  assert.equal(r.pitches3d, 43);
  const k = assessPitcher(base, [u("2026-09-12", null, 6), u("2026-09-14", null, 5)], days);
  assert.equal(k.status, "heavy");
  assert.equal(k.pitches3d, null);
  assert.equal(k.tbf3d, 11);
  // 창 밖(09-11 은 3일 창 밖)은 3일 누계에 안 든다
  assert.equal(assessPitcher(base, [u("2026-09-11", 30), u("2026-09-14", 18)], days).status, "caution");
});

test("KBO 이닝 표기", () => {
  assert.equal(kboIpToInnings("1 1/3"), 1 + 1 / 3);
  assert.equal(kboIpToInnings("2/3"), 2 / 3);
  assert.equal(kboIpToInnings("5"), 5);
  assert.equal(kboIpToInnings(null), 0);
});
