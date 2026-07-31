// 시즌 경계 계산 — 유럽 7월 전환 / 봄~가을 리그 오전환 방지 / 단발 대회 고정 연도.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSeasonYear,
  isSplitYearLeague,
  seasonLabelFor,
  seasonShapeFor,
  NO_STANDINGS_LEAGUES,
} from "./season-calendar";

const at = (iso: string) => new Date(iso);

test("유럽 리그는 7월에 새 시즌으로 넘어간다", () => {
  assert.equal(computeSeasonYear("EPL", at("2026-06-30T12:00:00Z")), 2025);
  assert.equal(computeSeasonYear("EPL", at("2026-07-01T00:00:00Z")), 2026);
  assert.equal(computeSeasonYear("EPL", at("2026-07-31T12:00:00Z")), 2026);
  assert.equal(computeSeasonYear("BUNDESLIGA", at("2027-01-15T12:00:00Z")), 2026);
});

test("봄~가을 리그는 7월에 시즌이 바뀌지 않는다", () => {
  for (const lg of ["K_LEAGUE_1", "J1_LEAGUE", "MLS", "BRASILEIRAO", "IRELAND_2", "YKKONEN"]) {
    assert.equal(computeSeasonYear(lg, at("2026-06-30T12:00:00Z")), 2026, lg);
    assert.equal(computeSeasonYear(lg, at("2026-07-01T00:00:00Z")), 2026, lg);
    assert.equal(computeSeasonYear(lg, at("2026-12-31T12:00:00Z")), 2026, lg);
    assert.equal(isSplitYearLeague(lg), false, lg);
  }
});

test("단발 대회는 고정 연도 — 달력이 바뀌어도 흔들리지 않는다", () => {
  assert.equal(computeSeasonYear("WORLD_CUP", at("2026-01-01T00:00:00Z")), 2026);
  assert.equal(computeSeasonYear("WORLD_CUP", at("2026-12-31T00:00:00Z")), 2026);
  assert.equal(computeSeasonYear("OLYMPICS_FOOTBALL", at("2026-07-31T00:00:00Z")), 2024);
  assert.equal(seasonShapeFor("WORLD_CUP").kind, "FIXED");
});

test("시즌 라벨 — 유럽형은 2026-27, 달력형은 2026", () => {
  assert.equal(seasonLabelFor("EPL", 2026), "2026-27");
  assert.equal(seasonLabelFor("LALIGA", 2029), "2029-30");
  assert.equal(seasonLabelFor("K_LEAGUE_1", 2026), "2026");
});

test("유럽 2부 신규 등록 리그도 7월 전환으로 분류된다", () => {
  for (const lg of ["CZECH_2", "DENMARK_2", "AUSTRIA_2", "HUNGARY_2"]) {
    assert.equal(isSplitYearLeague(lg), true, lg);
    assert.equal(computeSeasonYear(lg, at("2026-07-31T00:00:00Z")), 2026, lg);
  }
  // 아일랜드 2부는 2~10월 달력 시즌 — 유럽이라고 싸잡아 분류하지 않는다.
  assert.equal(isSplitYearLeague("IRELAND_2"), false);
});

test("친선은 순위표를 요구하지 않는다", () => {
  assert.ok(NO_STANDINGS_LEAGUES.has("CLUB_FRIENDLY"));
  assert.ok(NO_STANDINGS_LEAGUES.has("INTL_FRIENDLY"));
  assert.ok(!NO_STANDINGS_LEAGUES.has("EPL"));
});
