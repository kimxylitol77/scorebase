// MLB 포스트시즌 선수 기록 조립 테스트 — statsapi 문자열 파싱·한글 이름·투수 규정 이닝
import test from "node:test";
import assert from "node:assert/strict";
import { buildPostseasonRows, type PsSplit } from "./mlb-postseason-stats-build";
import { buildStatRows, columnsFor } from "./stats-table";

const hit = (id: number, g: number, avg: string, ops: string): PsSplit => ({
  player: { id, fullName: `P${id}` }, team: { id: 1, name: "Los Angeles Dodgers" },
  stat: { gamesPlayed: g, avg, ops, hits: 5, homeRuns: 1, rbi: 2, plateAppearances: 20, atBats: 18, doubles: 1, triples: 0, baseOnBalls: 2, intentionalWalks: 0, hitByPitch: 0, sacFlies: 0, strikeOuts: 4 },
});
const pit = (id: number, ip: string, era: string): PsSplit => ({
  player: { id, fullName: `Q${id}` }, team: { id: 1, name: "Los Angeles Dodgers" },
  stat: { gamesPitched: 3, era, whip: "1.00", inningsPitched: ip, strikeOuts: 10, wins: 1, losses: 0, saves: 0, battersFaced: 40, baseOnBalls: 3, hitByPitch: 0, homeRuns: 1, earnedRuns: 2 },
});

test("문자열 기록 파싱 · 한글 이름 우선 · 없으면 영문", () => {
  const r = buildPostseasonRows([hit(1, 10, ".300", ".900"), hit(2, 3, "1.000", "3.000")], [], (id) => (id === "1" ? "오타니" : undefined), () => "다저스");
  assert.equal(r.bat[0].name, "오타니");
  assert.equal(r.bat[1].name, "P2");
  assert.equal(r.bat[0].avg, 0.3);
  assert.equal(r.bat[0].team, "다저스");
  assert.equal(r.adv.hitting["1"].pa, 20);
});

test("투수 규정 = 최다 이닝 25% 올림, 이닝 표기 5.1 = 5⅓, '-.--' ERA 는 null", () => {
  const r = buildPostseasonRows([], [pit(1, "20.1", "2.66"), pit(2, "4.2", "0.00"), pit(3, "0.0", "-.--")], () => undefined, (n) => n);
  assert.equal(r.minIp, 6); // 20⅓ × 0.25 = 5.08 → 6
  assert.ok(Math.abs(r.pit[0].ip! - 61 / 3) < 1e-9);
  assert.equal(r.pit[2].era, null);
  const t = buildStatRows(r.pit, "pit", "total", columnsFor("pit", "MLB"), r.adv, r.minIp);
  assert.equal(t.qualifiedCount, 1); // 20⅓ 만 규정, 4⅔ 은 미달, 0이닝은 표에서 빠짐
  assert.equal(t.rows.length, 2);
});
