// 조건식 빌더 순수함수 테스트 — as-of 폼 누수 없음·연승연패·조건 평가·채점·튜플 왕복
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRuleFeatures, matchesRules, scoreRuleSystem, ruleFeatureToTuple, ruleFeatureFromTuple, type RuleMatchInput } from "./rule-system";

const d = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));
const g = (id: number, day: number, h: number, a: number, hs: number | null, as: number | null, extra: Partial<RuleMatchInput> = {}): RuleMatchInput => ({
  id, league: "L", homeTeamId: h, awayTeamId: a, startTime: d(day), status: hs == null ? "SCHEDULED" : "FINISHED", homeScore: hs, awayScore: as, ...extra,
});

test("폼은 그 경기 이전 결과만 본다(누수 없음), 3경기 미만이면 없음", () => {
  // 팀1 이 팀2 를 3번 이김 → 4번째 경기 시점 팀1 3연승·승률 100·득점 2/경기
  const ms = [g(1, 0, 1, 2, 2, 0), g(2, 2, 1, 2, 2, 1), g(3, 4, 2, 1, 0, 2), g(4, 6, 1, 2, 5, 5, { target: true, predCorrect: true })];
  const [f] = buildRuleFeatures(ms);
  assert.equal(f.matchId, 4);
  assert.equal(f.v.hWin5, 100);
  assert.equal(f.v.hGf5, 2);
  assert.equal(f.v.hStreak, 3);
  assert.equal(f.v.aStreak, -3);
  assert.equal(f.v.hRest, 2);
  assert.equal(f.res, 1); // 5-5 무승부
  // 2경기만 있는 시점은 폼 없음
  const [f2] = buildRuleFeatures([g(1, 0, 1, 2, 2, 0), g(2, 2, 1, 2, 2, 1), g(3, 4, 1, 2, null, null, { target: true })]);
  assert.equal(f2.v.hWin5, null);
  assert.equal(f2.v.hStreak, 2);
  assert.equal(f2.res, null);
});

test("무승부는 연승·연패를 끊는다", () => {
  const ms = [g(1, 0, 1, 2, 1, 0), g(2, 1, 1, 2, 1, 1), g(3, 2, 1, 2, 3, 0), g(4, 3, 1, 2, null, null, { target: true })];
  const [f] = buildRuleFeatures(ms);
  assert.equal(f.v.hStreak, 1);
});

test("조건 평가 — 값 없으면 불충족, 이상/이하", () => {
  const [f] = buildRuleFeatures([g(1, 0, 1, 2, null, null, { target: true, oddsAway: 2.4, predAway: 0.5, marketAway: 0.4 })]);
  assert.equal(f.v.edgeAway, 10);
  assert.equal(matchesRules(f, [{ field: "oddsAway", op: ">=", value: 2 }]), true);
  assert.equal(matchesRules(f, [{ field: "oddsAway", op: "<=", value: 2 }]), false);
  assert.equal(matchesRules(f, [{ field: "aWin5", op: ">=", value: 0 }]), false); // 폼 없음
  assert.equal(matchesRules(f, []), true);
});

test("채점 — 조건 걸린 종료 경기만, 픽 방향 적중·플랫 ROI·모델 기준선", () => {
  const ms = [
    g(1, 0, 1, 2, 0, 1, { target: true, oddsAway: 2.0, predCorrect: false }), // 원정 승 → 적중, +1u
    g(2, 1, 3, 4, 2, 0, { target: true, oddsAway: 2.0, predCorrect: true }), // 홈 승 → 실패, −1u
    g(3, 2, 5, 6, 0, 1, { target: true, oddsAway: 1.5, predCorrect: true }), // 조건(배당≥2) 밖
    g(4, 3, 7, 8, null, null, { target: true, oddsAway: 3.0 }), // 미종료 — 채점 제외
  ];
  const feats = buildRuleFeatures(ms);
  const r = scoreRuleSystem([{ league: "L", features: feats }], { side: "AWAY", league: "ALL", conds: [{ field: "oddsAway", op: ">=", value: 2 }] });
  assert.equal(r.total.n, 2);
  assert.equal(r.total.hits, 1);
  assert.equal(r.total.roi.units, 0);
  assert.equal(r.total.modelHits, 1);
  assert.equal(scoreRuleSystem([{ league: "L", features: feats }], { side: "AWAY", league: "X", conds: [] }).total.n, 0);
});

test("튜플 왕복", () => {
  const [f] = buildRuleFeatures([g(1, 0, 1, 2, 1, 0, { target: true, oddsHome: 1.234, predCorrect: true })]);
  const back = ruleFeatureFromTuple(ruleFeatureToTuple(f));
  assert.equal(back.matchId, 1);
  assert.equal(back.res, 0);
  assert.equal(back.modelHit, true);
  assert.equal(back.v.oddsHome, 1.23);
  assert.equal(back.v.hWin5, null);
});

test("저장 형식 파싱 — kind·side·conds 검증, 어긋나면 null", () => {
  const { parseRuleKnobs, ruleSystemToKnobs, describeRuleSystem, isRuleKnobs } = require("./rule-system") as typeof import("./rule-system");
  const sys = { side: "AWAY" as const, league: "KBO", conds: [{ field: "oddsAway" as const, op: ">=" as const, value: 2.004 }] };
  const knobs = ruleSystemToKnobs(sys);
  assert.equal(isRuleKnobs(knobs), true);
  assert.equal(isRuleKnobs({ elo: 1 }), false);
  const back = parseRuleKnobs(knobs, "KBO");
  assert.deepEqual(back, { side: "AWAY", league: "KBO", conds: [{ field: "oddsAway", op: ">=", value: 2 }] });
  assert.equal(parseRuleKnobs({ kind: "rules", side: "UP", conds: [] }), null);
  assert.equal(parseRuleKnobs({ kind: "rules", side: "HOME", conds: [{ field: "nope", op: ">=", value: 1 }] }), null);
  assert.equal(parseRuleKnobs({ kind: "rules", side: "HOME", conds: [{ field: "oddsHome", op: ">", value: 1 }] }), null);
  assert.equal(describeRuleSystem(back!), "원정 승 · 원정 승 배당 ≥ 2");
});
