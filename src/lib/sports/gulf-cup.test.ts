// 걸프컵 조별리그 — 조 판별·자체 순위·동률일 때 구역 보류.
import test from "node:test";
import assert from "node:assert/strict";
import { computeGroupTable, groupTeams, gulfZones } from "./gulf-cup";

const name = (id: number) => `팀${id}`;

test("경기 쌍으로 조를 가른다 — 같은 조끼리만 붙는다", () => {
  const g = groupTeams([[1, 2], [3, 4], [2, 3], [5, 6], [7, 8], [6, 7]]).map((x) => x.sort((a, b) => a - b));
  assert.deepEqual(g.sort((a, b) => a[0] - b[0]), [[1, 2, 3, 4], [5, 6, 7, 8]]);
});

test("승점 → 득실 → 다득점 순", () => {
  const rows = computeGroupTable([1, 2, 3, 4], [
    { homeId: 1, awayId: 2, homeScore: 1, awayScore: 1 }, // 이라크 1-1 오만 형태
    { homeId: 3, awayId: 4, homeScore: 1, awayScore: 0 }, // 사우디 1-0 쿠웨이트 형태
  ], name);
  assert.equal(rows[0].teamId, 3);
  assert.equal(rows[0].points, 3);
  assert.equal(rows[3].teamId, 4);
});

test("동률은 같은 순위 번호", () => {
  const rows = computeGroupTable([1, 2, 3, 4], [{ homeId: 1, awayId: 2, homeScore: 1, awayScore: 1 }], name);
  // 1·2 는 1무(승점1, 득실0, 1득점) 동률, 3·4 는 0경기 동률
  assert.deepEqual(rows.map((r) => r.position), [1, 1, 3, 3]);
});

test("4강권 — 경기 전엔 칠하지 않는다", () => {
  const rows = computeGroupTable([1, 2, 3, 4], [], name);
  assert.deepEqual(gulfZones(rows, false), [null, null, null, null]);
});

test("4강권 — 3위와 완전 동률이면 보류", () => {
  const rows = computeGroupTable([1, 2, 3, 4], [
    { homeId: 1, awayId: 2, homeScore: 2, awayScore: 0 },
    { homeId: 3, awayId: 4, homeScore: 1, awayScore: 1 },
  ], name);
  // 1: 승점3 / 3·4: 승점1 동률 — 둘 다 "2위"지만 한 팀만 올라간다 / 2: 승점0
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 2, 4]);
  assert.deepEqual(gulfZones(rows, true), ["sf", null, null, null]);
});

test("4강권 — 경계가 갈리면 1·2위 모두 표시", () => {
  const rows = computeGroupTable([1, 2, 3, 4], [
    { homeId: 1, awayId: 2, homeScore: 2, awayScore: 0 },
    { homeId: 3, awayId: 4, homeScore: 3, awayScore: 0 },
  ], name);
  const z = gulfZones(rows, true);
  assert.deepEqual(rows.filter((_, i) => z[i]).map((r) => r.teamId), [3, 1]);
});
