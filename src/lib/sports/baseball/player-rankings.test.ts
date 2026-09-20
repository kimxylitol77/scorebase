// 야구 랭킹 순수 계산 회귀 — 이닝 변환·타자/투수 자격 컷·ERA 역방향 백분위·가성비·폼 집계.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ipToNumber, computeBatPower, computePitPower, computeBbBargain, computeBbForm, aggregateForm, type BbPlayerRow } from "./player-rankings";

const row = (key: string, o: Partial<BbPlayerRow>): BbPlayerRow => ({
  key, externalId: key, name: key, nameEn: null, team: "T", games: 100,
  avg: null, hits: null, hr: null, rbi: null, ops: null, era: null, whip: null, ip: null, so: null, w: null, l: null, sv: null,
  salary: null, logId: key, ...o,
});

test("이닝 — 5.1 은 5⅓, 5.2 는 5⅔", () => {
  assert.ok(Math.abs(ipToNumber("5.1") - 5.333) < 0.001);
  assert.ok(Math.abs(ipToNumber("5.2") - 5.667) < 0.001);
  assert.equal(ipToNumber(null), 0);
});

test("타자 종합 — 최다 출장 50% 미만 제외, OPS 높은 쪽이 위", () => {
  const rows = computeBatPower([
    row("a", { games: 120, ops: 0.95, avg: 0.31, hr: 30, rbi: 90, hits: 150 }),
    row("b", { games: 110, ops: 0.7, avg: 0.25, hr: 5, rbi: 40, hits: 100 }),
    row("c", { games: 30, ops: 1.2, avg: 0.4, hr: 10, rbi: 20, hits: 40 }),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["a", "b"]);
  assert.ok(rows[0].score > rows[1].score);
});

test("투수 종합 — 30이닝 미만 제외, ERA 낮을수록 상위", () => {
  const rows = computePitPower([
    row("ace", { era: 2.1, whip: 0.95, ip: 150, so: 180, w: 15, sv: 0 }),
    row("mid", { era: 4.5, whip: 1.4, ip: 120, so: 90, w: 7, sv: 0 }),
    row("short", { era: 0.5, whip: 0.5, ip: 12, so: 20, w: 1, sv: 5 }),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["ace", "mid"]);
});

test("가성비 — 같은 지수면 연봉 낮은 쪽이 위, 연봉 없으면 제외", () => {
  const rows = [row("cheap", { salary: 100 }), row("pricey", { salary: 100000 }), row("nosal", {})];
  const power = [{ key: "cheap", score: 80, parts: [] }, { key: "pricey", score: 80, parts: [] }, { key: "nosal", score: 99, parts: [] }];
  assert.deepEqual(computeBbBargain(power, rows).map((r) => r.key), ["cheap", "pricey"]);
});

test("폼 집계 — 타자 OPS(HBP 포함 OBP)·투수 ERA, 컷 미달 제외", () => {
  const form = aggregateForm([
    { id: "h", role: "B", ab: 4, h: 2, d2b: 1, d3b: 0, hr: 1, bb: 1, hbp: 0, ip: null, er: 0 },
    { id: "h", role: "B", ab: 4, h: 0, d2b: 0, d3b: 0, hr: 0, bb: 0, hbp: 1, ip: null, er: 0 },
    { id: "p", role: "P", ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, bb: 0, hbp: 0, ip: "6.0", er: 2 },
    { id: "p", role: "P", ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, bb: 0, hbp: 0, ip: "3.0", er: 1 },
  ]);
  // 타자: AB 8, H 2, TB 2+1+3=6, BB 1, HBP 1 → OBP 4/10=.4, SLG 6/8=.75 → OPS 1.15
  assert.equal(form.h.ops, 1.15);
  assert.equal(form.h.avg, 0.25);
  // 투수: 9이닝 3자책 → ERA 3.00
  assert.equal(form.p.era, 3);
  const bat = computeBbForm([row("h", { ops: 0.8 })], { h: { n: 2, ab: 8, ops: 1.15, avg: 0.25 } }, "bat");
  assert.equal(bat.length, 0); // 25타수 미만
  const bat2 = computeBbForm([row("h", { ops: 0.8 })], { h: { n: 10, ab: 40, ops: 1.15, avg: 0.3 } }, "bat");
  assert.equal(bat2[0].delta, 0.35);
  const pit = computeBbForm([row("p", { era: 4 })], { p: { n: 5, ip: 30, era: 3 } }, "pit");
  assert.equal(pit[0].delta, -1);
});
