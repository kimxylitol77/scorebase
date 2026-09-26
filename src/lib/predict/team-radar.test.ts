// 팀 능력치 레이더 — 리그 안 순위 → 백분위, 표시 조건, 종목별 문구.
import test from "node:test";
import assert from "node:assert/strict";
import { computeLeagueRadars, radarSummary, RADAR_MIN_TEAMS } from "./team-radar";
import type { PredictMatch } from "./types";

let seq = 0;
const g = (home: number, away: number, hs: number, as: number, day: number): PredictMatch => ({
  id: ++seq, league: "X", status: "FINISHED", homeTeamId: home, awayTeamId: away,
  homeScore: hs, awayScore: as, startTime: new Date(Date.UTC(2026, 8, day)),
});

/** n팀 더블 라운드로빈 — 번호가 작은 팀이 항상 이긴다(1번이 최강). */
function league(n: number): PredictMatch[] {
  const ms: PredictMatch[] = [];
  let day = 1;
  for (let i = 1; i <= n; i++)
    for (let j = i + 1; j <= n; j++) {
      ms.push(g(i, j, 2, 0, day++));
      ms.push(g(j, i, 0, 1, day++));
    }
  return ms;
}
const eloOf = (id: number) => 1600 - id * 10;
const soccer = { hasDraw: true, unit: "골" };

test("최강 팀은 전 축 100, 최약 팀은 0", () => {
  const r = computeLeagueRadars(league(8), eloOf, soccer);
  assert.equal(r.size, 8);
  // 최근 폼은 상위 몇 팀이 똑같이 5연승이라 공동 1위 — 같은 순위면 같은 값
  assert.deepEqual(r.get(1)!.rows.map((x) => x.value), [100, 100, 100, 100, 100]);
  assert.equal(r.get(1)!.rows[3].rank, 1);
  assert.equal(r.get(1)!.rows[3].tied, true);
  assert.equal(r.get(1)!.rows[0].tied, false);
  assert.deepEqual(r.get(8)!.rows.map((x) => x.value), [0, 0, 0, 0, 0]);
  assert.equal(r.get(1)!.rows[0].rank, 1);
  assert.equal(r.get(1)!.rows[0].of, 8);
});

test("수비력은 실점이 적을수록 높다", () => {
  const r = computeLeagueRadars(league(8), eloOf, soccer);
  assert.match(r.get(1)!.rows[1].raw, /^경기당 실점 0\.0골$/);
  assert.equal(r.get(1)!.rows[1].value, 100);
});

test("리그 팀 수가 모자라면 그리지 않는다", () => {
  assert.equal(computeLeagueRadars(league(RADAR_MIN_TEAMS - 1), eloOf, soccer).size, 0);
});

test("리그 경기 5경기 미만 팀은 빠진다(승격 직후 등)", () => {
  const ms = [...league(8), g(99, 1, 0, 1, 200)];
  const r = computeLeagueRadars(ms, eloOf, soccer);
  assert.equal(r.has(99), false);
  assert.equal(r.size, 8);
});

test("동률은 같은 순위·같은 백분위", () => {
  const ms = league(8).map((m) => ({ ...m, homeScore: 1, awayScore: 1 }));
  const r = computeLeagueRadars(ms, () => 1500, soccer);
  const vals = [...r.values()].map((x) => x.rows[0].value);
  assert.equal(new Set(vals).size, 1);
  assert.equal([...r.values()][0].rows[0].rank, 1);
});

test("무승부 없는 종목은 폼에 무를 쓰지 않고 원정은 승률", () => {
  const r = computeLeagueRadars(league(8), eloOf, { hasDraw: false, unit: "점" });
  const rows = r.get(1)!.rows;
  assert.match(rows[3].raw, /^최근 5경기 5승 0패$/);
  assert.match(rows[4].raw, /^원정 승률 100%$/);
  assert.match(rows[0].raw, /점$/);
});

test("요약 한 줄 — 축별 리그 순위", () => {
  const r = computeLeagueRadars(league(8), eloOf, soccer);
  assert.equal(radarSummary(r.get(8)!), "공격력 8팀 중 8위 · 수비력 8팀 중 8위 · 전력 8팀 중 8위 · 최근 폼 8팀 중 8위 · 원정 8팀 중 8위");
});
