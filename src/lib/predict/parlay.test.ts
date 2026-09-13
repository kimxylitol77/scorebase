// 멀티픽 조합 — 경기 중복 금지·리그/마켓 회피 후 완화·결과 판정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildParlays, type ParlayLeg } from "./parlay";

const leg = (o: Partial<ParlayLeg> & { matchId: number; prob: number }): ParlayLeg => ({
  league: "EPL", market: "DOUBLE_CHANCE", pick: "p", correct: null, home: "H", away: "A", startTime: new Date(), ...o,
});
const rates = { DOUBLE_CHANCE: 0.72, HANDICAP: 0.7, "1X2": 0.71, OVER_UNDER: 0.7 } as const;

test("같은 경기의 두 마켓은 절대 같이 묶지 않는다", () => {
  const legs = [leg({ matchId: 1, prob: 0.9, market: "1X2" }), leg({ matchId: 1, prob: 0.85, market: "HANDICAP", league: "MLB" }), leg({ matchId: 2, prob: 0.7, league: "NPB" })];
  const [a] = buildParlays(legs, rates);
  assert.deepEqual(a.legs.map((l) => l.matchId), [1, 2]);
});

test("리그·마켓이 다른 조합을 먼저 고른다", () => {
  const legs = [
    leg({ matchId: 1, prob: 0.9, league: "EPL", market: "DOUBLE_CHANCE" }),
    leg({ matchId: 2, prob: 0.88, league: "EPL", market: "DOUBLE_CHANCE" }),
    leg({ matchId: 3, prob: 0.7, league: "MLB", market: "HANDICAP" }),
  ];
  const [a] = buildParlays(legs, rates);
  assert.deepEqual(a.legs.map((l) => l.matchId), [1, 3]);
  assert.ok(Math.abs(a.prob - 0.63) < 1e-9);
  assert.ok(Math.abs((a.expected ?? 0) - 0.72 * 0.7) < 1e-9);
});

test("리그·마켓이 전부 같아도 경기만 다르면 완화해서 채운다", () => {
  const legs = [leg({ matchId: 1, prob: 0.9 }), leg({ matchId: 2, prob: 0.8 }), leg({ matchId: 3, prob: 0.7 })];
  const ps = buildParlays(legs, rates);
  assert.equal(ps.find((p) => p.key === "B")?.legs.length, 3);
});

test("레그가 부족하면 3레그·대체 조합은 안 만든다", () => {
  const ps = buildParlays([leg({ matchId: 1, prob: 0.9 }), leg({ matchId: 2, prob: 0.8, league: "MLB" })], rates);
  assert.deepEqual(ps.map((p) => p.key), ["A"]);
});

test("결과 판정 — 하나라도 빗나가면 false, 전부 맞으면 true, 미채점 섞이면 null", () => {
  const ok = leg({ matchId: 1, prob: 0.9, correct: true });
  const bad = leg({ matchId: 2, prob: 0.8, league: "MLB", correct: false });
  const pend = leg({ matchId: 3, prob: 0.7, league: "NPB", correct: null });
  assert.equal(buildParlays([ok, bad], rates)[0].correct, false);
  assert.equal(buildParlays([ok, leg({ matchId: 4, prob: 0.8, league: "MLB", correct: true })], rates)[0].correct, true);
  assert.equal(buildParlays([ok, pend], rates)[0].correct, null);
});
