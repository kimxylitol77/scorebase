// buildAgBkStandings — 조 묶기·조 안 정렬·결승/3·4위전 판정(2026 여자 대회 축소판).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgBkStandings, type StageMatch } from "./asian-games-standings";

let t = 0;
const m = (stageId: string, homeId: number, awayId: number, hs: number, as: number): StageMatch =>
  ({ stageId, startTime: ++t, homeId, awayId, homeScore: hs, awayScore: as, finished: true });

// 조1 = 1·2·3, 조2 = 4·5·6. 8강 없이 4강(1v5, 4v2) → 3·4위전 → 결승
const games = [
  m("G", 1, 2, 80, 70), m("G", 4, 5, 60, 50), m("G", 2, 3, 90, 60), m("G", 5, 6, 70, 65),
  m("G", 3, 1, 50, 100), m("G", 6, 4, 55, 75),
  m("SF", 1, 5, 70, 72), m("SF", 4, 2, 66, 61),
  m("B", 1, 2, 90, 80),
  m("F", 5, 4, 70, 75),
];

test("조별리그 경기로 이어진 팀끼리 조가 된다", () => {
  const s = buildAgBkStandings(games);
  assert.equal(s.groups.length, 2);
  assert.deepEqual(s.groups[0].map((r) => r.teamId), [1, 2, 3]);
  assert.deepEqual(s.groups[1].map((r) => r.teamId), [4, 5, 6]);
  assert.deepEqual([s.groups[0][0].w, s.groups[0][0].l, s.groups[0][0].pf, s.groups[0][0].pa], [2, 0, 180, 120]);
});

test("결승·3·4위전으로 1~4위", () => {
  assert.deepEqual(buildAgBkStandings(games).podium, [4, 5, 1, 2]);
});

test("결승 전이면 자리를 비운다", () => {
  assert.deepEqual(buildAgBkStandings(games.slice(0, 8)).podium, [null, null, null, null]);
});

test("승이 같은 두 팀은 맞대결 승자가 위", () => {
  const s = buildAgBkStandings([m("G", 7, 8, 60, 70), m("G", 8, 9, 50, 99), m("G", 9, 7, 60, 61)]);
  // 셋 다 1승 1패 — 세 팀 동률이면 득실차: 9(+48) 7(-9) 8(-39)
  assert.deepEqual(s.groups[0].map((r) => r.teamId), [9, 7, 8]);
});
