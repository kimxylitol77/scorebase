// UEFA 리그페이즈 규칙 — 단계 판정·일정 묶음 키·진출 구역.
import test from "node:test";
import assert from "node:assert/strict";
import { UEFA_QUALIFYING_KEY, uefaFixtureKey, uefaFixtureKeyName, uefaStage, uefaZone } from "./uefa-league-phase";

const ts = (stageName: string, roundNum: number) => JSON.stringify({ thesports: { round: { stageId: "x", roundNum, groupNum: 0, stageName } } });

test("단계 — ts League Phase·League Round, af League Stage", () => {
  assert.deepEqual(uefaStage(ts("League Phase", 3)), { leagueRound: 3, label: "League Phase" });
  assert.deepEqual(uefaStage(ts("League Round", 8)), { leagueRound: 8, label: "League Round" });
  assert.deepEqual(uefaStage('{"league":{"round":"League Stage - 5"}}'), { leagueRound: 5, label: "League Stage - 5" });
  assert.equal(uefaStage(ts("Qualification", 2))?.leagueRound, null);
  assert.equal(uefaStage(null), null);
});

const lpStart = new Date("2026-09-08T16:45:00Z");

test("일정 묶음 — 리그페이즈 앞은 예선, 뒤는 녹아웃 순서", () => {
  assert.equal(uefaFixtureKey(uefaStage(ts("League Phase", 2)), new Date("2026-10-13T19:00:00Z"), lpStart), 2);
  assert.equal(uefaFixtureKey(null, new Date("2026-07-07T18:00:00Z"), lpStart), UEFA_QUALIFYING_KEY);
  assert.equal(uefaFixtureKey(uefaStage(ts("Play-offs", 0)), new Date("2026-08-25T19:00:00Z"), lpStart), UEFA_QUALIFYING_KEY); // 예선 플레이오프
  assert.equal(uefaFixtureKey(uefaStage(ts("Knockout Round Play-offs", 0)), new Date("2027-02-16T20:00:00Z"), lpStart), 9);
  assert.equal(uefaFixtureKey(uefaStage(ts("Round of 16", 0)), new Date("2027-03-09T20:00:00Z"), lpStart), 10);
  assert.equal(uefaFixtureKey(uefaStage(ts("Final", 0)), new Date("2027-05-29T19:00:00Z"), lpStart), 13);
});

test("묶음 이름·진출 구역", () => {
  assert.equal(uefaFixtureKeyName(0).chip, "예선");
  assert.equal(uefaFixtureKeyName(3).option, "리그페이즈 3라운드");
  assert.equal(uefaFixtureKeyName(10).chip, "16강");
  assert.equal(uefaZone(8), "r16");
  assert.equal(uefaZone(9), "playoff");
  assert.equal(uefaZone(24), "playoff");
  assert.equal(uefaZone(25), "out");
});
