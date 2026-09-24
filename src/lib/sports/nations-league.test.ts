// 네이션스리그 허브 규칙 — 라운드 해석·빅매치 선정·확정 구역·한국시간.
import test from "node:test";
import assert from "node:assert/strict";
import { kstKickoff, nlZone, parseNlGroup, parseNlRound, pickFeatured, type NlMatchLite } from "./nations-league";

test("af raw 의 round 에서 등급·라운드를 읽는다", () => {
  assert.deepEqual(parseNlRound('{"league":{"round":"League A - 3"}}'), { tier: "A", matchday: 3 });
  assert.deepEqual(parseNlRound('{"round":"League D - 1"}'), { tier: "D", matchday: 1 });
  assert.equal(parseNlRound('{"round":"Regular Season - 5"}'), null);
  assert.equal(parseNlRound(null), null);
});

test("af 조 원문에서 등급·조 번호를 읽는다", () => {
  assert.deepEqual(parseNlGroup("UEFA Nations League , League B, Group 4"), { tier: "B", group: 4 });
  assert.equal(parseNlGroup("Group A"), null);
});

test("확정 구역 — 리그 A 는 1·2위, 나머지는 1위만", () => {
  assert.equal(nlZone("A", 2, true), "qf");
  assert.equal(nlZone("A", 3, true), null);
  assert.equal(nlZone("B", 1, true), "promo");
  assert.equal(nlZone("B", 2, true), null);
});

test("개막 전(조 0경기)엔 구역을 칠하지 않는다 — 순서가 임의라 확정처럼 보인다", () => {
  assert.equal(nlZone("A", 1, false), null);
  assert.equal(nlZone("D", 1, false), null);
});

const m = (o: Partial<NlMatchLite> & { id: number }): NlMatchLite => ({
  tier: "A", matchday: 1, status: "SCHEDULED", startTime: new Date("2026-09-25T18:45:00Z"), rankSum: null, ...o,
});

test("빅매치 — 진행 중 경기가 최우선", () => {
  const f = pickFeatured([m({ id: 1, rankSum: 5 }), m({ id: 2, status: "LIVE", rankSum: 90 })]);
  assert.equal(f?.id, 2);
});

test("빅매치 — 가장 이른 미진행 라운드에서 FIFA 순위 합이 가장 작은 경기", () => {
  const f = pickFeatured([
    m({ id: 1, matchday: 2, rankSum: 3 }),  // 더 늦은 라운드라 제외
    m({ id: 2, matchday: 1, rankSum: 40 }),
    m({ id: 3, matchday: 1, rankSum: 19 }),
    m({ id: 4, matchday: 1, tier: "B", rankSum: 1 }), // 리그 A 만
  ]);
  assert.equal(f?.id, 3);
});

test("빅매치 — 리그페이즈가 끝나면 마지막 경기", () => {
  const f = pickFeatured([
    m({ id: 1, status: "FINISHED", startTime: new Date("2026-11-14T19:45:00Z") }),
    m({ id: 2, status: "FINISHED", startTime: new Date("2026-11-17T19:45:00Z") }),
  ]);
  assert.equal(f?.id, 2);
});

test("리그 A 경기가 없으면 null", () => {
  assert.equal(pickFeatured([m({ id: 1, tier: "C" })]), null);
});

test("한국시간 표기는 서버 시간대와 무관", () => {
  assert.equal(kstKickoff(new Date("2026-09-24T18:45:00Z")), "9/25 (금) 03:45");
  assert.equal(kstKickoff(new Date("2026-09-24T16:00:00Z")), "9/25 (금) 01:00");
});
