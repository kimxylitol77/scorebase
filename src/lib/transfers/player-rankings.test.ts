// 종합·유망주·상승률 랭킹 순수 계산 회귀 — 자격 컷·포지션 그룹 백분위·나이 보정·상승률 모드.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  percentiles, computePowerRanking, computeProspectRanking, computeGrowthRanking, posGroupOf, seasonStartUtc, type RankInput,
  computeBargainRanking, computeFormRanking, computeTrophyRanking, computeContractRanking, trophyPoints,
} from "./player-rankings";

const mk = (id: string, o: Partial<RankInput> & { mins?: number; g?: number; a?: number; rating?: number | null; ratedN?: number; recent5?: number; recent5N?: number }): RankInput => ({
  id,
  value: o.value ?? 20,
  v1y: o.v1y === undefined ? 10 : o.v1y,
  age: o.age ?? 26,
  posCode: o.posCode ?? "ST",
  stat: o.mins == null ? null : { n: 5, starts: 5, mins: o.mins, g: o.g ?? 0, a: o.a ?? 0, ratedN: o.ratedN ?? 5, rating: o.rating === undefined ? 7 : o.rating, recent5: o.recent5 ?? null, recent5N: o.recent5N ?? 0 },
});

test("백분위 — 동점은 평균 순위, 최솟값 0·최댓값 100", () => {
  const p = percentiles([["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
  assert.equal(p.get("a"), 0);
  assert.equal(p.get("d"), 100);
  assert.equal(p.get("b"), p.get("c"));
  assert.equal(p.get("b"), 50);
});

test("종합 — 180분·평점 3경기 미달은 순위 제외, 기록 없는 선수도 제외", () => {
  const rows = computePowerRanking([
    mk("ok", { mins: 500 }),
    mk("short", { mins: 100 }),
    mk("unrated", { mins: 500, ratedN: 1 }),
    mk("nostat", {}),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["ok"]);
});

test("종합 — 같은 그룹에서 평점·골 기여가 높으면 위, GK 는 골 기여 가중 0", () => {
  const rows = computePowerRanking([
    mk("star", { mins: 900, g: 8, a: 4, rating: 7.6 }),
    mk("avg", { mins: 900, g: 2, a: 1, rating: 6.8 }),
    mk("gk1", { posCode: "GK", mins: 900, rating: 7.0 }),
    mk("gk2", { posCode: "GK", mins: 900, rating: 6.5 }),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(by.star.score > by.avg.score);
  assert.ok(by.gk1.score > by.gk2.score);
  assert.equal(by.gk1.parts.ga90 * 0, 0);
  assert.equal(posGroupOf("GK"), "GK");
  assert.equal(posGroupOf("CB"), "DEF");
  assert.equal(posGroupOf("CM"), "MID");
  assert.equal(posGroupOf(null), "ATT");
});

test("유망주 — 21세 초과·90분 미만 제외, 어릴수록 보정, 100 상한", () => {
  const rows = computeProspectRanking([
    mk("y18", { age: 18, mins: 400, value: 30 }),
    mk("y21", { age: 21, mins: 400, value: 30 }),
    mk("y22", { age: 22, mins: 400, value: 30 }),
    mk("y19short", { age: 19, mins: 30, value: 30 }),
  ]);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["y18", "y21"]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.ok(by.y18.score >= by.y21.score);
  assert.ok(rows.every((r) => r.score <= 100));
  assert.equal(computeProspectRanking([mk("y22", { age: 22, mins: 400 })], 23).length, 1);
});

test("상승률 — 노이즈 컷, pct·abs·down 정렬", () => {
  const pool = [
    mk("doubler", { value: 4, v1y: 2 }), // +100%, +2
    mk("bigabs", { value: 80, v1y: 60 }), // +33%, +20
    mk("faller", { value: 10, v1y: 20 }), // -50%
    mk("tiny", { value: 1.5, v1y: 0.5 }), // 컷
    mk("nohist", { value: 30, v1y: null }),
  ];
  assert.deepEqual(computeGrowthRanking(pool, "pct").map((r) => r.id), ["doubler", "bigabs"]);
  assert.deepEqual(computeGrowthRanking(pool, "abs").map((r) => r.id), ["bigabs", "doubler"]);
  assert.deepEqual(computeGrowthRanking(pool, "down").map((r) => r.id), ["faller"]);
});

test("시즌 시작 — 7월 이후는 올해 7/1, 이전은 작년 7/1", () => {
  assert.equal(seasonStartUtc(new Date("2026-09-20T00:00:00Z")).toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(seasonStartUtc(new Date("2027-03-01T00:00:00Z")).toISOString(), "2026-07-01T00:00:00.000Z");
});

test("가성비 — 같은 성과면 몸값 낮은 쪽이 위, 3M 미만 제외", () => {
  const rows = computeBargainRanking([
    mk("cheap", { mins: 900, g: 5, rating: 7.5, value: 5 }),
    mk("pricey", { mins: 900, g: 5, rating: 7.5, value: 120 }),
    mk("tiny", { mins: 900, g: 5, rating: 7.5, value: 1 }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["cheap", "pricey"]);
});

test("폼 — 최근 5경기 미만 제외, hot 내림·cold 오름, 시즌 대비 차이", () => {
  const pool = [
    mk("hot", { mins: 900, rating: 7.0, recent5: 7.8, recent5N: 5 }),
    mk("cold", { mins: 900, rating: 7.0, recent5: 6.2, recent5N: 5 }),
    mk("few", { mins: 900, rating: 7.0, recent5: 9, recent5N: 3 }),
  ];
  assert.deepEqual(computeFormRanking(pool, "hot").map((r) => r.id), ["hot", "cold"]);
  assert.deepEqual(computeFormRanking(pool, "cold").map((r) => r.id), ["cold", "hot"]);
  assert.equal(computeFormRanking(pool, "hot")[0].delta, 0.8);
});

test("트로피 — 점수표·유스 0점·미등재 1점, 상위 대회 3개와 횟수", () => {
  assert.equal(trophyPoints("UEFA Champions League"), 10);
  assert.equal(trophyPoints("UEFA U21 Championship"), 0);
  assert.equal(trophyPoints("Trofeo Joan Gamper"), 0);
  assert.equal(trophyPoints("Liga Portugal Betclic Something"), 1);
  const rows = computeTrophyRanking(
    [
      { playerId: "a", league: "UEFA Champions League", season: "2024" },
      { playerId: "a", league: "UEFA Champions League", season: "2025" },
      { playerId: "a", league: "Community Shield", season: "2025" },
      { playerId: "a", league: "UEFA Youth League", season: "2019" },
      { playerId: "b", league: "Premier League", season: "2025" },
      { playerId: "x", league: "FIFA World Cup", season: "2022" },
    ],
    new Set(["a", "b"]),
  );
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  assert.equal(rows[0].pts, 21);
  assert.equal(rows[0].n, 3);
  assert.deepEqual(rows[0].top, ["UEFA Champions League ×2", "Community Shield"]);
});

test("계약 만료 — 기간 내만, 몸값 내림차순", () => {
  const now = 1_000_000, horizon = now + 100;
  const rows = computeContractRanking(
    [mk("a", { value: 10 }), mk("b", { value: 50 }), mk("c", { value: 99 }), mk("d", { value: 5 })],
    { a: now + 10, b: now + 50, c: now + 200, d: now - 1 },
    horizon, now,
  );
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
});
