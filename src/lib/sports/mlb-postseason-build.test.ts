// MLB 포스트시즌 대진표 모델 — 시드·자리표시자 한글화·예상 채우기·시리즈 승수·승리 확률.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMlbPostseason,
  placeholderName,
  seriesWinProb,
  type ApiGame,
  type ApiSeries,
  type ApiStandingRecord,
  type ApiTeamRef,
} from "./mlb-postseason-build";

const T = (id: number, abbr: string, lg = 103): ApiTeamRef => ({ id, name: `Team ${abbr}`, abbreviation: abbr, league: { id: lg } });
const P = (id: number, name: string, abbr = name): ApiTeamRef => ({ id, name, abbreviation: abbr, placeholder: true, league: { id: 103 } });
const st = (t: ApiTeamRef, w: number, l: number, div: string, wc: string | null, clinch: string | null = null) => ({
  team: t, wins: w, losses: l, winningPercentage: (w / (w + l)).toFixed(3), divisionRank: div, wildCardRank: wc,
  wildCardGamesBack: "-", clinchIndicator: clinch,
});
// AL 3개 지구 — 지구 1위 A(95)·B(85)·C(80), 와일드카드 D·E·F, 추격 G
const records: ApiStandingRecord[] = [
  { league: { id: 103 }, division: { id: 1 }, teamRecords: [st(T(1, "AAA"), 95, 65, "1", null, "z"), st(T(4, "DDD"), 92, 68, "2", "1", "w")] },
  { league: { id: 103 }, division: { id: 2 }, teamRecords: [st(T(2, "BBB"), 85, 75, "1", null), st(T(5, "EEE"), 88, 72, "2", "2")] },
  { league: { id: 103 }, division: { id: 3 }, teamRecords: [st(T(3, "CCC"), 80, 80, "1", null), st(T(6, "FFF"), 84, 76, "2", "3"), st(T(7, "GGG"), 83, 77, "3", "4")] },
];
const g = (pk: number, home: ApiTeamRef, away: ApiTeamRef, x: Partial<ApiGame> = {}, winnerHome?: boolean): ApiGame => ({
  gamePk: pk, gameDate: "2026-09-29T20:00:00Z", status: { abstractGameState: winnerHome == null ? "Preview" : "Final" },
  seriesDescription: "AL Wild Card Series",
  teams: {
    home: { team: home, score: winnerHome == null ? undefined : winnerHome ? 3 : 1, isWinner: winnerHome === true },
    away: { team: away, score: winnerHome == null ? undefined : winnerHome ? 1 : 3, isWinner: winnerHome === false },
  },
  ...x,
});
const opts = { nameOf: (t: ApiTeamRef) => t.abbreviation ?? t.name, eloOf: () => 1500, koreaOf: (id: number) => (id === 5 ? ["김하성"] : []) };

test("시드 — 지구 1위 승률순 1~3, 와일드카드 4~6, 확정 표시·추격 팀", () => {
  const d = buildMlbPostseason(2026, records, [], opts);
  assert.deepEqual(d.seeds.AL.map((s) => `${s.seed}${s.abbr}`), ["1AAA", "2BBB", "3CCC", "4DDD", "5EEE", "6FFF"]);
  assert.equal(d.seeds.AL[0].status, "부전승 확정");
  assert.equal(d.seeds.AL[1].status, null);
  assert.deepEqual(d.chase.AL.map((c) => c.name), ["GGG"]);
});

test("자리표시자 한글화", () => {
  const byAbbr = new Map([["CWS", "시카고W"], ["CLE", "클리블랜드"]]);
  assert.equal(placeholderName("CWS/CLE", byAbbr), "시카고W/클리블랜드");
  assert.equal(placeholderName("AL 3/6 Winner", byAbbr), "3·6 승자");
  assert.equal(placeholderName("NL Wild Card #2", byAbbr), "와일드카드 2위");
  assert.equal(placeholderName("Lower Seed League Champion", byAbbr), "리그 챔피언");
});

test("자리표시자 자리를 현재 시드로 채우고 '예상' 표시 — 후보에 없는 팀은 채우지 않는다", () => {
  const series: ApiSeries[] = [
    { series: { id: "F_1", gameType: "F" }, games: [g(1, P(900, "CCC/GGG"), P(901, "FFF/GGG"))] },
    { series: { id: "F_2", gameType: "F" }, games: [g(2, P(902, "AL Wild Card #1", "AL WC1"), P(903, "AL Wild Card #2", "AL WC2"))] },
    { series: { id: "D_1", gameType: "D" }, games: [g(3, T(1, "AAA"), P(904, "AL 4/5 Winner", "AL4/5"), { seriesDescription: "AL Division Series" })] },
    { series: { id: "D_2", gameType: "D" }, games: [g(4, P(905, "BBB/XXX"), P(906, "AL 3/6 Winner", "AL3/6"), { seriesDescription: "AL Division Series" })] },
  ];
  const d = buildMlbPostseason(2026, records, series, opts);
  const f1 = d.series.find((s) => s.id === "F_1")!;
  assert.equal(f1.top.abbr, "CCC");
  assert.equal(f1.top.projected, true);
  assert.equal(f1.top.slotNote, "CCC/GGG");
  assert.equal(f1.bottom.abbr, "FFF");
  const f2 = d.series.find((s) => s.id === "F_2")!;
  assert.deepEqual([f2.top.seed, f2.bottom.seed], [4, 5]);
  assert.deepEqual(f2.bottom.korea, ["김하성"]);
  const d2 = d.series.find((s) => s.id === "D_2")!;
  assert.equal(d2.top.abbr, "BBB");
  assert.equal(d2.bottom.placeholder, true);
  assert.equal(d.fieldSet, false);
});

test("시리즈 승수·결판 — 3전 2선승", () => {
  const a = T(4, "DDD");
  const b = T(5, "EEE");
  const series: ApiSeries[] = [{ series: { id: "F_2", gameType: "F" }, games: [g(1, a, b, {}, true), g(2, a, b, {}, true), g(3, a, b)] }];
  const s = buildMlbPostseason(2026, records, series, opts).series[0];
  assert.deepEqual([s.winsTop, s.winsBottom, s.state, s.winnerId], [2, 0, "FINAL", 4]);
  assert.equal(s.probTop, null);
});

test("시리즈 승리 확률 — 동률 0.5, 승수 반영", () => {
  assert.equal(seriesWinProb("wc", 0.5, 0.5), 0.5);
  assert.equal(seriesWinProb("ws", 1, 1), 1);
  assert.ok(Math.abs(seriesWinProb("wc", 0.5, 0.5, 1, 0) - 0.75) < 1e-9);
  assert.ok(seriesWinProb("ds", 0.6, 0.5) > 0.55);
});
