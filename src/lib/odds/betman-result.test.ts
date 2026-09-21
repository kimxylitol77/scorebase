// 베트맨 결과 코드·AI 판정·회차 집계 고정. 케이스는 raw 260112 응답과 운영 DB 대조 실측.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aiVerdict, lineKind, oddsX100, parseChgDtm, resultLabel, roundLabel, summarizeChanges, summarizeRound } from "./betman-result";

test("라인 종류 — betTypNm 우선, 승N패는 betNm 으로도 잡는다", () => {
  assert.equal(lineKind("승무패", "축구 승무패"), "1x2");
  assert.equal(lineKind("일반 승패", "야구 승패"), "wl");
  assert.equal(lineKind("일반 소수핸디캡", "야구 핸디캡"), "handicap");
  assert.equal(lineKind("일반 언더오버", "야구 언더오버"), "ou");
  assert.equal(lineKind("일반 홀짝", "야구 SUM"), "oddeven");
  assert.equal(lineKind("승N패", "야구 승1패"), "winN");
  assert.equal(lineKind(null, "농구 승5패"), "winN");
});

test("결과 라벨 — 언더오버는 win 쪽이 언더(winTxt 실측), 4 는 적특, 승N패 가운데는 N점차", () => {
  assert.deepEqual(resultLabel("0", "ou", "야구 언더오버"), { text: "언더", side: "win" });
  assert.deepEqual(resultLabel("2", "ou", "야구 언더오버"), { text: "오버", side: "lose" });
  assert.deepEqual(resultLabel("4", "1x2", null), { text: "적특", side: "void" });
  assert.deepEqual(resultLabel("1", "winN", "농구 승5패"), { text: "5점차", side: "draw" });
  assert.deepEqual(resultLabel("1", "1x2", "축구 승무패"), { text: "무", side: "draw" });
  assert.equal(resultLabel(null, "1x2", null), null);
  assert.equal(resultLabel("1", "ou", null), null); // 언더오버엔 무가 없다
});

test("AI 판정 — HOME↔0 · DRAW↔1 · AWAY↔2, 적특은 void, 미판정은 pending, 픽 없으면 null", () => {
  assert.equal(aiVerdict("HOME", "0"), "hit");
  assert.equal(aiVerdict("AWAY", "0"), "miss");
  assert.equal(aiVerdict("DRAW", "1"), "hit");
  assert.equal(aiVerdict("HOME", "4"), "void");
  assert.equal(aiVerdict("HOME", null), "pending");
  assert.equal(aiVerdict(null, "0"), null);
  assert.equal(aiVerdict("X", "0"), null);
});

test("회차 집계 — 적특·미판정은 분모 제외, 종목별 분리", () => {
  const s = summarizeRound([
    { itemCode: "BS", predWinner: "HOME", gameResult: "0" },
    { itemCode: "BS", predWinner: "HOME", gameResult: "2" },
    { itemCode: "BS", predWinner: "AWAY", gameResult: "4" },
    { itemCode: "SC", predWinner: "DRAW", gameResult: "1" },
    { itemCode: "SC", predWinner: "HOME", gameResult: null },
    { itemCode: "SC", predWinner: null, gameResult: "0" },
  ]);
  assert.equal(s.total, 5);
  assert.equal(s.scored, 3);
  assert.equal(s.hit, 2);
  assert.equal(s.void, 1);
  assert.equal(s.pending, 1);
  assert.deepEqual(s.bySport, { BS: { scored: 2, hit: 1 }, SC: { scored: 1, hit: 1 } });
});

test("변동 요약 — 시각순 첫 before → 마지막 after, 핸디 라인 변경 감지", () => {
  const s = summarizeChanges([
    { changedAt: "2026-09-21T04:03:20.000Z", beforeWin: 1.54, afterWin: 1.5, beforeDraw: null, afterDraw: null, beforeLose: 2.05, afterLose: 2.1, beforeWinHandi: -2.5, afterWinHandi: -3.5 },
    { changedAt: "2026-09-21T01:11:19.000Z", beforeWin: 1.59, afterWin: 1.54, beforeDraw: null, afterDraw: null, beforeLose: 1.97, afterLose: 2.05, beforeWinHandi: -2.5, afterWinHandi: -2.5 },
  ]);
  assert.ok(s);
  assert.equal(s.count, 2);
  assert.deepEqual(s.win, { from: 1.59, to: 1.5, dir: "down" });
  assert.deepEqual(s.lose, { from: 1.97, to: 2.1, dir: "up" });
  assert.equal(s.draw, null);
  assert.deepEqual(s.handi, { from: -2.5, to: -3.5 });
  assert.equal(summarizeChanges([]), null);
});

test("회차 라벨·CHG_DTM·x100 배당", () => {
  assert.equal(roundLabel(260111), "2026년 111회차");
  assert.equal(roundLabel(270003), "2027년 3회차");
  assert.equal(parseChgDtm("20260921130320863455")?.toISOString(), "2026-09-21T04:03:20.000Z");
  assert.equal(parseChgDtm("2026"), null);
  assert.equal(oddsX100(159), 1.59);
  assert.equal(oddsX100(0), null);
  assert.equal(oddsX100("205"), 2.05);
});
