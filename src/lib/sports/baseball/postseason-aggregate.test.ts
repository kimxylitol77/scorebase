// KBO·NPB 포스트시즌 합산 테스트 — 시리즈 합산 후 비율 재계산·이닝 표기·id 칸
import test from "node:test";
import assert from "node:assert/strict";
import { kboIpToNumber, npbIpToNumber, sumBatLines, sumPitLines } from "./postseason-aggregate";

test("타자: 시리즈 합산 뒤 타율·OPS 는 성분으로 다시 계산, 0타수는 타율 null", () => {
  const rows = sumBatLines([
    { id: "1", name: "노시환", team: "한화", g: 5, ab: 21, h: 7, d2b: 1, d3b: 0, hr: 1, rbi: 2, bb: 0, hbp: 0 },
    { id: "1", name: "노시환", team: "한화", g: 5, ab: 21, h: 9, d2b: 1, d3b: 0, hr: 2, rbi: 5, bb: 2, hbp: 0 },
    { id: "2", name: "와이스", team: "한화", g: 1, ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, rbi: 0, bb: 0, hbp: 0 },
  ], "externalId");
  const a = rows.find((r) => r.key === "1")!;
  assert.equal(a.games, 10);
  assert.equal(a.hits, 16);
  assert.ok(Math.abs(a.avg! - 16 / 42) < 1e-9);
  assert.ok(Math.abs(a.ops! - (18 / 44 + (16 + 2 + 9) / 42)) < 1e-9);
  assert.equal(a.externalId, "1");
  assert.equal(a.logId, null);
  assert.equal(rows.find((r) => r.key === "2")!.avg, null);
});

test("투수: ERA·WHIP 재계산, NPB 는 logId 칸", () => {
  const [p] = sumPitLines([
    { id: "9", name: "A", team: "한신", g: 1, w: 1, l: 0, sv: 0, ip: 7, h: 6, bb: 2, so: 6, er: 1 },
    { id: "9", name: "A", team: "한신", g: 1, w: 0, l: 1, sv: 0, ip: 2, h: 3, bb: 1, so: 2, er: 2 },
  ], "logId");
  assert.equal(p.w, 1);
  assert.equal(p.l, 1);
  assert.equal(p.era, 3);
  assert.equal(p.whip, 12 / 9);
  assert.equal(p.logId, "9");
});

test("이닝 표기", () => {
  assert.ok(Math.abs(kboIpToNumber("7 2/3") - 23 / 3) < 1e-9);
  assert.ok(Math.abs(kboIpToNumber("2/3") - 2 / 3) < 1e-9);
  assert.equal(kboIpToNumber("5"), 5);
  assert.ok(Math.abs(npbIpToNumber("1.1") - 4 / 3) < 1e-9);
});
