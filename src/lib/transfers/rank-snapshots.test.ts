// 순위 스냅샷 기준선 — 필터 재번호·NEW 판정·KST 날짜 경계 회귀.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baselineRankMap, prevRankOf, kstToday, type Baseline } from "./rank-snapshots";

const base: Baseline = {
  day: "2026-09-19",
  rows: [
    { playerId: "a", rank: 1, league: "EPL", posCode: "ST", score: 90 },
    { playerId: "b", rank: 2, league: "LALIGA", posCode: "W", score: 88 },
    { playerId: "c", rank: 3, league: "EPL", posCode: "GK", score: 80 },
    { playerId: "d", rank: 4, league: "EPL", posCode: "ST", score: 70 },
  ],
};

test("기준선 — 무필터는 저장 순위 그대로, 리그·포지션 필터는 다시 번호를 매긴다", () => {
  const all = baselineRankMap(base, {})!;
  assert.equal(all.get("d"), 4);
  const epl = baselineRankMap(base, { league: "EPL" })!;
  assert.deepEqual([...epl.entries()], [["a", 1], ["c", 2], ["d", 3]]);
  const eplSt = baselineRankMap(base, { league: "EPL", pos: "ST" })!;
  assert.equal(eplSt.get("d"), 2);
  assert.equal(eplSt.has("c"), false);
});

test("이전 순위 — 기준선 없으면 undefined, 없던 선수는 null(NEW)", () => {
  assert.equal(prevRankOf(null, "a"), undefined);
  const m = baselineRankMap(base, {});
  assert.equal(prevRankOf(m, "a"), 1);
  assert.equal(prevRankOf(m, "zzz"), null);
});

test("KST 오늘 — UTC 자정 직전은 KST 로 다음 날", () => {
  assert.equal(kstToday(new Date("2026-09-20T15:30:00Z")).toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(kstToday(new Date("2026-09-20T14:30:00Z")).toISOString(), "2026-09-20T00:00:00.000Z");
});
