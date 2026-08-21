// 순위 캐시 시즌 게이트 — 이전 시즌 캐시가 새 시즌 화면에 새지 않는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { afCacheUsable, isSeasonGated, standingsState, tsCacheUsable } from "./standings-gate";

test("ACTIVE 와 같은 시즌의 ts 캐시만 쓴다", () => {
  assert.equal(tsCacheUsable("EPL", "s2026", "s2026").usable, true);
  const stale = tsCacheUsable("EPL", "s2026", "s2025");
  assert.equal(stale.usable, false);
  assert.equal(stale.reason, "season-mismatch");
});

test("이전 시즌 api-football fallback 도 거부한다", () => {
  assert.equal(afCacheUsable("CHAMPIONSHIP", 2026, 2026).usable, true);
  const stale = afCacheUsable("CHAMPIONSHIP", 2026, 2025);
  assert.equal(stale.usable, false);
  assert.equal(stale.reason, "season-mismatch");
});

test("레지스트리에 ACTIVE 가 없으면 기존 동작을 유지한다 — 도입만으로 화면이 바뀌면 안 된다", () => {
  const ts = tsCacheUsable("EPL", null, "무슨-시즌이든");
  assert.equal(ts.usable, true);
  assert.equal(ts.reason, "no-registry");
  const af = afCacheUsable("EPL", null, 2019);
  assert.equal(af.usable, true);
});

test("캐시에 시즌 표기가 없으면 쓰지 않는다", () => {
  assert.equal(tsCacheUsable("EPL", "s2026", null).usable, false);
  assert.equal(afCacheUsable("EPL", 2026, null).usable, false);
});

test("게이트는 축구에만 건다 — 야구/농구 파이프라인은 건드리지 않는다", () => {
  assert.equal(isSeasonGated("EPL"), true);
  assert.equal(isSeasonGated("KBO"), false);
  assert.equal(isSeasonGated("NBA"), false);
  // 비축구는 시즌이 달라도 그대로 통과 (기존 동작 보존)
  assert.equal(tsCacheUsable("KBO", "s2026", "s2025").usable, true);
  assert.equal(afCacheUsable("KBO", 2026, 2025).usable, true);
});

test("개막 전에는 지난 시즌 표 대신 PRESEASON 상태를 준다", () => {
  const now = new Date("2026-07-31T00:00:00Z");
  const opensLater = new Date("2026-08-15T00:00:00Z");
  assert.equal(standingsState("EPL", false, opensLater, now), "PRESEASON");
  assert.equal(standingsState("EPL", true, opensLater, now), "READY");
});

test("개막했는데 순위 소스가 없으면 MISSING 으로 보고한다", () => {
  const now = new Date("2026-09-15T00:00:00Z");
  const started = new Date("2026-09-20T00:00:00Z");
  assert.equal(standingsState("CZECH_2", false, null, now), "MISSING");
  // 일정이 미래면 개막 전 — MISSING 이 아니다
  assert.equal(standingsState("CZECH_2", false, started, now), "PRESEASON");
});

test("친선은 순위 없음이 정상 상태다", () => {
  assert.equal(standingsState("CLUB_FRIENDLY", false, null, new Date()), "NOT_APPLICABLE");
  assert.equal(standingsState("INTL_FRIENDLY", false, null, new Date()), "NOT_APPLICABLE");
});

test("치른 경기가 있으면 표가 비어도 개막 전이 아니다 — 시즌 중 소스 결손", () => {
  const now = new Date("2026-08-21T00:00:00Z");
  const nextGame = new Date("2026-08-22T00:00:00Z");
  // 2026-08-21 YKKOSLIIGA 실측: 96경기를 치른 리그에 "시즌 개막 전 · 첫 경기 8-21" 이 떴다.
  assert.equal(standingsState("YKKOSLIIGA", false, nextGame, now, true), "MISSING");
  // 아직 한 경기도 안 치렀으면 기존대로 개막 전.
  assert.equal(standingsState("YKKOSLIIGA", false, nextGame, now, false), "PRESEASON");
});
