// 라인업 임팩트 산식 회귀 — 리그 평균 라인업은 xR = lgR/G, 강타자 교체는 Δ 양수, 표본 부족은 수축.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLineupImpact, paForSlot, woba, shrinkWoba, type BattingComponents } from "./lineup-impact";

const avg: BattingComponents = { pa: 600, ab: 540, h: 140, d2b: 28, d3b: 3, hr: 18, bb: 50, ibb: 2, hbp: 5, sf: 5 };
const star: BattingComponents = { pa: 600, ab: 500, h: 150, d2b: 30, d3b: 4, hr: 40, bb: 90, ibb: 10, hbp: 6, sf: 4 };
const rookie: BattingComponents = { pa: 20, ab: 18, h: 9, d2b: 2, d3b: 0, hr: 2, bb: 2, ibb: 0, hbp: 0, sf: 0 };

test("타순별 타석: 1번 4.65, 9번 3.77, 합 약 37.9", () => {
  assert.equal(paForSlot(1), 4.65);
  assert.ok(Math.abs(paForSlot(9) - 3.77) < 1e-9);
  const sum = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, s) => a + paForSlot(s), 0);
  assert.ok(Math.abs(sum - 37.89) < 0.01);
});

test("wOBA: 분모 0 이면 null, 강타자 > 평균", () => {
  assert.equal(woba({ ...avg, ab: 0, bb: 0, ibb: 0, sf: 0, hbp: 0 }), null);
  assert.ok(woba(star)! > woba(avg)!);
});

test("리그 평균 wOBA 라인업이면 xR = lgR/G, Δ 는 벤치 대비", () => {
  const lgW = woba(avg)!;
  const lineup = Array.from({ length: 9 }, (_, i) => ({ pid: i + 1, name: `p${i + 1}`, slot: i + 1, comp: avg }));
  const r = computeLineupImpact(lineup, [avg, avg], { rpg: 4.5, woba: lgW });
  assert.ok(Math.abs(r.xr - 4.5) < 1e-9);
  assert.ok(r.players.every((p) => Math.abs(p.delta) < 1e-9));
  assert.equal(r.benchFallback, false);
});

test("강타자를 1번에 넣으면 xR 상승·Δ 양수, 표본 부족 신인은 수축 표시", () => {
  const lgW = woba(avg)!;
  const lineup = Array.from({ length: 9 }, (_, i) => ({ pid: i + 1, name: `p${i + 1}`, slot: i + 1, comp: i === 0 ? star : i === 8 ? rookie : avg }));
  const r = computeLineupImpact(lineup, [avg], { rpg: 4.5, woba: lgW });
  assert.ok(r.xr > 4.5);
  assert.ok(r.players[0].delta > 0);
  assert.equal(r.players[8].shrunk, true);
  // 신인 원시 wOBA 는 높지만 수축돼 리그 평균에 가깝다
  assert.ok(r.players[8].wobaRaw! > r.players[8].woba);
  assert.ok(Math.abs(r.players[8].woba - lgW) < Math.abs(r.players[8].wobaRaw! - lgW));
});

test("벤치가 없으면 리그 평균으로 대체하고 플래그", () => {
  const lgW = woba(avg)!;
  const lineup = Array.from({ length: 9 }, (_, i) => ({ pid: i + 1, name: `p${i + 1}`, slot: i + 1, comp: avg }));
  const r = computeLineupImpact(lineup, [], { rpg: 4.5, woba: lgW });
  assert.equal(r.benchFallback, true);
  assert.equal(shrinkWoba(0.4, 0, 0.3), 0.3);
});
