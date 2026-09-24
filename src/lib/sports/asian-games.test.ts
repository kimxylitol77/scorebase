// 아시안게임 축구 허브 규칙 — 조 글자·진행 단계·국가명.
import test from "node:test";
import assert from "node:assert/strict";
import { asianGamesGroupLetter, asianGamesNation, asianGamesStageIndex } from "./asian-games";

test("ts 조 번호 → 공식 조 글자 (남자 1~4 = A~D, 여자 5~7 = E~G, 0 은 3위 비교표)", () => {
  assert.equal(asianGamesGroupLetter(1), "A");
  assert.equal(asianGamesGroupLetter(4), "D"); // 한국 남자 = D조(3팀)
  assert.equal(asianGamesGroupLetter(6), "F"); // 한국 여자 = F조
  assert.equal(asianGamesGroupLetter(0), null);
});

test("진행 단계 — 조별 1~3R, 8강 4, 4강 5, 결승·3·4위전 6", () => {
  assert.equal(asianGamesStageIndex("Group Stage", 2), 2);
  assert.equal(asianGamesStageIndex("Quarterfinals", 0), 4);
  assert.equal(asianGamesStageIndex("Semi-finals", 0), 5);
  assert.equal(asianGamesStageIndex("Final", 0), 6);
  assert.equal(asianGamesStageIndex("3rd Place", 0), 6);
  assert.equal(asianGamesStageIndex("Group Stage", 0), null);
  assert.equal(asianGamesStageIndex("Round of 16", 0), null);
});

test("국가명 — U23·Women 접미사와 China Hong Kong 정리", () => {
  assert.equal(asianGamesNation("South Korea U23"), "South Korea");
  assert.equal(asianGamesNation("North Korea Women"), "North Korea");
  assert.equal(asianGamesNation("China Hong Kong Women"), "Hong Kong");
  assert.equal(asianGamesNation("Japan"), "Japan");
});
