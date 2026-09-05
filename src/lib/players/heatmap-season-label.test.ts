// 히트맵 시즌 라벨 도출 고정. 케이스는 2026-09-05 production 실측.
import { test } from "node:test";
import assert from "node:assert/strict";
import { heatmapSeasonLabel, seasonKeyForDate } from "./heatmap-season-label";

test("지난 시즌 경기만 있으면 지난 시즌 라벨 — 모건 로져스 사례", () => {
  // 소스가 26/27 좌표를 아직 안 줘 5월(25/26) 경기만 남았는데 라벨은 26/27 이었다.
  const ms = [{ date: "2026-05-15" }, { date: "2026-05-10" }, { date: "2025-08-20" }];
  assert.equal(heatmapSeasonLabel("2026-27 EPL", ms), "2025-26 EPL");
});

test("이번 시즌 경기가 들어오면 이번 시즌으로 올라간다", () => {
  const ms = [{ date: "2026-09-01" }, { date: "2026-05-15" }];
  assert.equal(heatmapSeasonLabel("2026-27 EPL", ms), "2026-27 EPL");
});

test("달력 시즌 리그는 연도 하나로 — K리그", () => {
  assert.equal(heatmapSeasonLabel("2026 K_LEAGUE_1", [{ date: "2026-08-30" }]), "2026 K_LEAGUE_1");
  assert.equal(heatmapSeasonLabel("2026 K_LEAGUE_1", [{ date: "2025-10-02" }]), "2025 K_LEAGUE_1");
});

test("경기가 없으면 기존 라벨을 그대로 둔다 — 지어낼 근거가 없다", () => {
  assert.equal(heatmapSeasonLabel("2026-27 EPL", []), "2026-27 EPL");
});

test("시즌 경계는 7월 — 6월은 직전 시즌, 8월은 새 시즌", () => {
  assert.equal(seasonKeyForDate("2026-06-30").euro, "2025-26");
  assert.equal(seasonKeyForDate("2026-07-01").euro, "2026-27");
  assert.equal(seasonKeyForDate("2026-08-15").euro, "2026-27");
});

test("리그명이 여러 단어여도 보존한다", () => {
  assert.equal(heatmapSeasonLabel("2026-27 SERIE A", [{ date: "2026-05-01" }]), "2025-26 SERIE A");
});
