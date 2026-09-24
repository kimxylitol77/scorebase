import assert from "node:assert/strict";
import test from "node:test";
import { isSplitSquadSibling, pickClosestCandidate } from "./split-squad";

// 2026-09-23 실측: 같은 23:00Z 에 OTT@TOR(ESPN 401886441)·TOR@OTT(ESPN 401879650) 두 경기.
const TOR = 720;
const OTT = 725;
const T = new Date("2026-09-23T23:00:00Z");
const ottHome = { externalId: "401879650", homeTeamId: OTT, awayTeamId: TOR, startTime: T };
const torHome = { externalId: "401886441", homeTeamId: TOR, awayTeamId: OTT, startTime: T };

test("같은 응답에 따로 실린 역방향 이벤트는 병합하지 않는다 — NHL 스플릿 스쿼드", () => {
  const batch = new Set([ottHome.externalId, torHome.externalId]);
  // TOR 홈 경기가 들어올 때 OTT 홈 row 는 짝 경기다.
  assert.equal(isSplitSquadSibling(ottHome, { homeTeamId: TOR, awayTeamId: OTT }, batch), true);
});

test("다른 소스·다른 수집에서 온 역방향 후보는 종전대로 병합 대상", () => {
  // 소스 간 홈/원정 표기 차이 흡수 — 이번 응답에 없는 row 면 같은 경기로 본다.
  assert.equal(isSplitSquadSibling(ottHome, { homeTeamId: TOR, awayTeamId: OTT }, new Set(["401886441"])), false);
  assert.equal(isSplitSquadSibling(ottHome, { homeTeamId: TOR, awayTeamId: OTT }, undefined), false);
});

test("같은 방향 쌍둥이는 같은 응답에 있어도 병합 대상 — 유령 id 방어 유지", () => {
  const batch = new Set([ottHome.externalId, "999"]);
  assert.equal(isSplitSquadSibling(ottHome, { homeTeamId: OTT, awayTeamId: TOR }, batch), false);
});

test("킥오프가 같으면 방향이 같은 row 를 고른다 — 후보 순서와 무관", () => {
  const startMs = T.getTime();
  assert.equal(pickClosestCandidate([ottHome, torHome], { homeTeamId: TOR, awayTeamId: OTT, startMs }), torHome);
  assert.equal(pickClosestCandidate([torHome, ottHome], { homeTeamId: TOR, awayTeamId: OTT, startMs }), torHome);
  assert.equal(pickClosestCandidate([torHome, ottHome], { homeTeamId: OTT, awayTeamId: TOR, startMs }), ottHome);
});

test("시각 차가 있으면 여전히 가장 가까운 후보가 이긴다", () => {
  const near = { ...ottHome, startTime: new Date(T.getTime() + 60_000) }; // 역방향 1분 차
  const far = { ...torHome, startTime: new Date(T.getTime() + 3_600_000) }; // 같은 방향 1시간 차
  assert.equal(pickClosestCandidate([far, near], { homeTeamId: TOR, awayTeamId: OTT, startMs: T.getTime() }), near);
  assert.equal(pickClosestCandidate([], { homeTeamId: TOR, awayTeamId: OTT, startMs: T.getTime() }), null);
});
