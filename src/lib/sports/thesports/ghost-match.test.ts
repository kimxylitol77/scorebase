// 유령 매치 판정 가드 테스트 — 오탐 한 번이 정상 경기 삭제라 규모·참조 가드가 핵심이다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GHOST_ABORT_ABSOLUTE,
  assessCandidateVolume,
  isDeletable,
  pickGhostCandidates,
  tsUuidOf,
} from "./ghost-match";

test("tsUuidOf 는 ts 접두만 벗기고 다른 소스는 제외한다", () => {
  assert.equal(tsUuidOf("ts-1l4rjnh9w5nym7v"), "1l4rjnh9w5nym7v");
  assert.equal(tsUuidOf("1623434"), null); // api-football fixture id
});

test("diary 에 있는 매치는 후보가 아니다", () => {
  const matches = [
    { id: 1, externalId: "ts-aaa" },
    { id: 2, externalId: "ts-bbb" },
  ];
  const got = pickGhostCandidates(matches, new Set(["aaa", "bbb"]));
  assert.deepEqual(got, []);
});

test("diary 에 없는 매치만 후보로 뽑는다", () => {
  const matches = [
    { id: 1, externalId: "ts-aaa" },
    { id: 2, externalId: "ts-ghost" },
  ];
  const got = pickGhostCandidates(matches, new Set(["aaa"]));
  assert.deepEqual(got.map((m) => m.id), [2]);
});

test("ts 가 아닌 매치는 diary 에 없어도 후보가 아니다 — 이 잡의 대상 밖", () => {
  const matches = [{ id: 1, externalId: "1623434" }];
  assert.deepEqual(pickGhostCandidates(matches, new Set()), []);
});

test("후보 0건이면 진행한다", () => {
  assert.equal(assessCandidateVolume(0, 540).proceed, true);
});

test("소수 후보는 정상 범위로 진행한다", () => {
  assert.equal(assessCandidateVolume(1, 540).proceed, true);
  assert.equal(assessCandidateVolume(20, 540).proceed, true);
});

test("절대 상한을 넘으면 중단한다 — ts 대량 결손 방어", () => {
  const v = assessCandidateVolume(GHOST_ABORT_ABSOLUTE, 5000);
  assert.equal(v.proceed, false);
});

test("대상 대비 비율이 크면 중단한다 — diary 부분 실패 방어", () => {
  // 10/40 = 25% — 절대수는 작지만 비율이 이례적이다.
  const v = assessCandidateVolume(10, 40);
  assert.equal(v.proceed, false);
});

test("사람 흔적이 없어야 삭제한다", () => {
  assert.equal(isDeletable({ articles: 0, votes: 0 }), true);
  assert.equal(isDeletable({ articles: 1, votes: 0 }), false);
  assert.equal(isDeletable({ articles: 0, votes: 3 }), false);
});
