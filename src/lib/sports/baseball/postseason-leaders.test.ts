// 포스트시즌 리더보드 행 변환 테스트 — 규정 필터·정렬·빈 카테고리 제거
import { test } from "node:test";
import assert from "node:assert/strict";
import { postseasonLeaderRows } from "./postseason-leaders";
import type { BbPlayerRow } from "./player-rankings";

const base: BbPlayerRow = { key: "", externalId: null, name: "", nameEn: null, team: "T", games: 0, avg: null, hits: null, hr: null, rbi: null, ops: null, era: null, whip: null, ip: null, so: null, w: null, l: null, sv: null, salary: null, logId: null };
const bat = (name: string, games: number, avg: number, hr: number): BbPlayerRow => ({ ...base, key: name, name, externalId: name, games, avg, hits: 1, hr, rbi: 0 });
const pit = (name: string, ip: number, era: number, so: number): BbPlayerRow => ({ ...base, key: name, name, externalId: name, games: 1, ip, era, so, w: 0, l: 0 });

test("타율은 최다 출장 절반 미만 제외, ERA 는 규정 이닝 미만 제외", () => {
  const r = postseasonLeaderRows(
    { bat: [bat("A", 4, 0.3, 1), bat("B", 1, 1.0, 0), bat("C", 2, 0.25, 2)], pit: [pit("P", 12, 3.0, 10), pit("Q", 1, 0, 2)], minIp: 3 },
    () => null,
    (x) => x.externalId,
  );
  assert.deepEqual(r.BA.map((x) => x.playerName), ["A", "C"]);
  assert.deepEqual(r.HR.map((x) => x.playerName), ["C", "A"]);
  assert.deepEqual(r.ERA.map((x) => x.playerName), ["P"]);
  assert.deepEqual(r.K.map((x) => x.value), [10, 2]);
  assert.equal(r.RBI, undefined); // 타점 0 뿐 → 카테고리 제거
  assert.equal(r.WIN, undefined);
});
