// 축구 스탯 표 회귀 — 포지션 필·규정(분 40%)·90분당·GK 열·실점 반전.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSoccerStatRows, columnsForPos, soccerValue, FIELD_COLUMNS, type SoccerSeasonRow } from "./stats-table";

const mk = (o: Partial<SoccerSeasonRow>): SoccerSeasonRow => ({
  playerId: o.name ?? "p", name: "p", team: "T", pos: "F", photo: null, matches: 0, starts: 0, minutes: 0, goals: 0, assists: 0, shots: 0, sot: 0, keyPasses: 0,
  passAcc: null, tackles: 0, interceptions: 0, yellow: 0, red: 0, saves: 0, cleanSheets: null, conceded: null, rating: null, ratedMinutes: 0, ...o,
});

test("규정·백분위·90분당", () => {
  const rows = [mk({ name: "A", minutes: 900, goals: 10, yellow: 2 }), mk({ name: "B", minutes: 600, goals: 3, yellow: 5 }), mk({ name: "C", minutes: 100, goals: 4 }), mk({ name: "GK", pos: "G", minutes: 900, saves: 40, conceded: 10 })];
  const t = buildSoccerStatRows(rows, "ALL", "total");
  assert.equal(t.minMinutes, 360); assert.equal(t.qualifiedCount, 2);
  assert.deepEqual(t.rows.map((r) => r.name).sort(), ["A", "B", "C"]); // GK 제외
  const a = t.rows.find((r) => r.name === "A")!, b = t.rows.find((r) => r.name === "B")!;
  assert.equal(a.cells.goals.pct, 50); assert.equal(b.cells.goals.pct, 0);
  assert.equal(a.cells.yellow.pct, 50); assert.equal(b.cells.yellow.pct, 0); // 경고는 반전: 적을수록 상위
  assert.equal(t.rows.find((r) => r.name === "C")!.cells.goals.pct, null);
  const p90 = buildSoccerStatRows(rows, "ALL", "per90").rows.find((r) => r.name === "A")!;
  assert.equal(p90.cells.goals.value, 1); // 10골 / 900분 × 90
  assert.equal(p90.cells.minutes.value, 900);
});

test("GK 열과 실점 반전, 포지션 필", () => {
  const rows = [mk({ name: "G1", pos: "G", minutes: 900, saves: 40, conceded: 10 }), mk({ name: "G2", pos: "G", minutes: 900, saves: 20, conceded: 20 }), mk({ name: "F", minutes: 900 })];
  const t = buildSoccerStatRows(rows, "G", "total");
  assert.deepEqual(t.rows.map((r) => r.name).sort(), ["G1", "G2"]);
  assert.equal(t.rows.find((r) => r.name === "G1")!.cells.conceded.pct, 50);
  assert.equal(t.rows.find((r) => r.name === "G2")!.cells.conceded.pct, 0);
  assert.equal(columnsForPos("G").some((c) => c.key === "saves"), true);
  assert.equal(columnsForPos("ALL").some((c) => c.key === "saves"), false);
  assert.equal(soccerValue(mk({ minutes: 0, goals: 2 }), FIELD_COLUMNS.find((c) => c.key === "goals")!, "per90"), null);
});
