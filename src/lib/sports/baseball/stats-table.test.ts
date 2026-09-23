// 스탯 마스터 표 회귀 — 규정 판정·반전 백분위·경기당·NPB 투수 타율 제외·정렬 null 뒤로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatRows, percentile, rowsForRole, sortStatRows, statValue, BAT_COLUMNS, PIT_COLUMNS } from "./stats-table";
import type { BbPlayerRow } from "./player-rankings";

const base = (o: Partial<BbPlayerRow>): BbPlayerRow => ({
  key: o.name ?? "x", externalId: null, name: "x", nameEn: null, team: "T", games: 0,
  avg: null, hits: null, hr: null, rbi: null, ops: null, era: null, whip: null, ip: null, so: null, w: null, l: null, sv: null, salary: null, logId: null, ...o,
});

test("백분위: 높을수록 좋은 열과 낮을수록 좋은 열, 동률 절반", () => {
  assert.equal(percentile([1, 2, 3, 4], 4), 75);
  assert.equal(percentile([1, 2, 3, 4], 1, true), 75);
  assert.equal(percentile([2, 2, 2], 2), 33);
});

test("타자 표: 규정 = 최다 출장 50%, 미달은 pct null, 경기당 환산", () => {
  const rows = [
    base({ name: "A", games: 140, avg: 0.3, ops: 0.9, hits: 150, hr: 30, rbi: 90 }),
    base({ name: "B", games: 100, avg: 0.25, ops: 0.7, hits: 90, hr: 10, rbi: 40 }),
    base({ name: "C", games: 20, avg: 0.4, ops: 1.2, hits: 30, hr: 5, rbi: 10 }),
  ];
  const t = buildStatRows(rows, "bat", "total");
  assert.equal(t.minGames, 70); assert.equal(t.qualifiedCount, 2);
  const c = t.rows.find((r) => r.name === "C")!; assert.equal(c.qualified, false); assert.equal(c.cells.avg.pct, null);
  const a = t.rows.find((r) => r.name === "A")!; assert.equal(a.cells.avg.pct, 50); // 규정 2명 중 최고: 나보다 못한 1명 / 2 = 50
  const pg = buildStatRows(rows, "bat", "pergame").rows.find((r) => r.name === "A")!;
  assert.ok(Math.abs(pg.cells.hr.value! - 30 / 140) < 1e-9);
  assert.equal(pg.cells.avg.value, 0.3); // 비율 지표는 그대로
});

test("투수 표: 30이닝 규정, ERA 반전, K/9 파생, NPB 투수는 타자 표에서 제외", () => {
  const rows = [
    base({ name: "P1", games: 30, era: 2.0, whip: 1.0, ip: 180, so: 200, w: 15, l: 5, sv: 0, avg: 0.05, hits: 3 }),
    base({ name: "P2", games: 60, era: 4.0, whip: 1.4, ip: 60, so: 50, w: 3, l: 4, sv: 20, avg: 0, hits: 0 }),
    base({ name: "P3", games: 5, era: 9.0, whip: 2.0, ip: 8, so: 4, w: 0, l: 1, sv: 0 }),
    base({ name: "H", games: 120, avg: 0.28, hits: 120 }),
  ];
  const t = buildStatRows(rows, "pit", "total");
  assert.deepEqual(t.rows.map((r) => r.name).sort(), ["P1", "P2", "P3"]);
  const p1 = t.rows.find((r) => r.name === "P1")!;
  assert.equal(p1.cells.era.pct, 50); assert.equal(p1.qualified, true);
  assert.ok(Math.abs(p1.cells.k9.value! - 10) < 1e-9);
  assert.equal(t.rows.find((r) => r.name === "P3")!.qualified, false);
  assert.deepEqual(rowsForRole(rows, "bat").map((r) => r.name), ["H"]); // 투수 타율 제외(안타 20 미만)
  assert.equal(statValue(rows[0], PIT_COLUMNS.find((c) => c.key === "ip")!, "pergame"), 6);
  assert.equal(BAT_COLUMNS.length, 6);
});

test("정렬: 값 없음은 항상 뒤", () => {
  const t = buildStatRows([base({ name: "A", games: 10, avg: 0.3 }), base({ name: "B", games: 10, avg: null, hits: 1 }), base({ name: "C", games: 10, avg: 0.2 })], "bat", "total");
  assert.deepEqual(sortStatRows(t.rows, "avg", "desc").map((r) => r.name), ["A", "C"]);
  assert.deepEqual(sortStatRows(t.rows, "avg", "asc").map((r) => r.name), ["C", "A"]);
});
