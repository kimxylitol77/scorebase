// 요소 우세 칩 판정 테스트 — 임계 경계·표본 부족·종료 경기 제외·순위 칩
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeEdgeBadges, rankBadge, roughInnings } from "./edge-badges";

const starter = (era: number, ip: string) => JSON.stringify({ name: "x", era, ip });

test("선발 ERA 1.0 이상 차이 + 최소 이닝이면 선발 우세, 이닝 부족이면 없음", () => {
  const r = computeEdgeBadges({ status: "SCHEDULED", homeStarter: starter(2.8, "120.1"), awayStarter: starter(4.9, "66 2/3") });
  assert.deepEqual(r.map((b) => [b.key, b.side]), [["starter", "home"]]);
  assert.equal(computeEdgeBadges({ status: "SCHEDULED", homeStarter: starter(2.8, "12"), awayStarter: starter(4.9, "80") }).length, 0);
  assert.equal(computeEdgeBadges({ status: "SCHEDULED", homeStarter: starter(3.5, "80"), awayStarter: starter(4.2, "80") }).length, 0);
});

test("불펜·골리·모델 칩과 종료 경기 제외, 최대 3개", () => {
  const base = {
    homeBullpen: JSON.stringify({ pitches3d: 80 }), awayBullpen: JSON.stringify({ pitches3d: 190 }),
    homeGoalie: JSON.stringify({ savePctg: 0.905, gamesPlayed: 20 }), awayGoalie: JSON.stringify({ savePctg: 0.921, gamesPlayed: 20 }),
    predHome: 0.58, predAway: 0.42, marketHome: 0.5, marketAway: 0.5,
    homeStarter: starter(2.0, "100"), awayStarter: starter(5.0, "100"),
  };
  const r = computeEdgeBadges({ status: "LIVE", ...base });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((b) => `${b.key}:${b.side}`), ["starter:home", "bullpen:home", "goalie:away"]);
  assert.equal(computeEdgeBadges({ status: "FINISHED", ...base }).length, 0);
  const onlyModel = computeEdgeBadges({ status: "SCHEDULED", predHome: 0.3, predAway: 0.7, marketHome: 0.4, marketAway: 0.6 });
  assert.deepEqual(onlyModel.map((b) => `${b.key}:${b.side}`), ["model:away"]);
  assert.equal(computeEdgeBadges({ status: "SCHEDULED", predHome: 0.53, predAway: 0.47, marketHome: 0.5, marketAway: 0.5 }).length, 0);
});

test("순위 칩과 이닝 파서", () => {
  assert.equal(rankBadge(2, 15)?.side, "home");
  assert.equal(rankBadge(12, 3)?.side, "away");
  assert.equal(rankBadge(4, 9), null);
  assert.equal(rankBadge(null, 3), null);
  assert.equal(roughInnings("119.1"), 119);
  assert.equal(roughInnings("66 2/3"), 66);
  assert.equal(roughInnings(null), null);
});
