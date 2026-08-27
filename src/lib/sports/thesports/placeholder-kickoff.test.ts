// 자리표시자 킥오프 판정 고정. 케이스는 2026-08-28 ts UCL 실측.
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderKickoffTimes, PLACEHOLDER_MIN_SAME_KICKOFF } from "./placeholder-kickoff";

const at = (iso: string, n: number) =>
  Array.from({ length: n }, () => ({ startTime: new Date(iso) }));

test("추첨 직후 한 시각에 몰린 144경기를 잡는다 — UCL 리그페이즈 실측", () => {
  const s = placeholderKickoffTimes(at("2026-09-08T19:00:00Z", 144));
  assert.equal(s.size, 1);
  assert.ok(s.has(Date.parse("2026-09-08T19:00:00Z")));
});

test("정상 매치데이는 걸리지 않는다 — 한 시각 최대 9경기", () => {
  const day = [...at("2026-09-15T16:45:00Z", 3), ...at("2026-09-15T19:00:00Z", 6),
               ...at("2026-09-16T16:45:00Z", 3), ...at("2026-09-16T19:00:00Z", 6)];
  assert.equal(placeholderKickoffTimes(day).size, 0);
});

test("경계 — 17경기는 통과, 18경기부터 자리표시자", () => {
  assert.equal(placeholderKickoffTimes(at("2026-10-20T19:00:00Z", PLACEHOLDER_MIN_SAME_KICKOFF - 1)).size, 0);
  assert.equal(placeholderKickoffTimes(at("2026-10-20T19:00:00Z", PLACEHOLDER_MIN_SAME_KICKOFF)).size, 1);
});

test("자리표시자와 정상 일정이 섞여 오면 자리표시자 시각만 골라낸다", () => {
  const mixed = [...at("2026-09-08T19:00:00Z", 144), ...at("2026-09-15T19:00:00Z", 6)];
  const s = placeholderKickoffTimes(mixed);
  assert.equal(s.size, 1);
  assert.ok(!s.has(Date.parse("2026-09-15T19:00:00Z")));
});

test("빈 입력은 빈 집합", () => {
  assert.equal(placeholderKickoffTimes([]).size, 0);
});
