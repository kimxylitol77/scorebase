// 한국어 순도 게이트 — 실제 발행됐던 중국어 글을 막고, 관용 한자·영문 약어는 통과시키는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { foreignScriptReason } from "./korean-purity";

test("실제 발행됐던 중국어 글(#3678·#3400)을 막는다", () => {
  assert.ok(foreignScriptReason("切尔西主场胜券在握\n## 海外赔率趋势\n海外推荐中，84%的预测倾向于切尔西主场比赛获胜"));
  assert.ok(foreignScriptReason("맨시티, 코번트리를 압도할 것\n맨시티의 压倒的优势明显，结合 Elo 레이팅과 배당을 보면 홈승이 유력하다."));
});

test("일본어 가나를 막는다", () => {
  assert.ok(foreignScriptReason("첼시가 ホーム에서 승리할 것으로 본다. 최근 5경기 4승 1무로 흐름이 좋다."));
});

test("관용 한자 낱글자·영문 약어는 통과", () => {
  assert.equal(foreignScriptReason("[BBC] 히샬리송, 바스쿠 다가마行 무산…토트넘 잔류"), null);
  assert.equal(foreignScriptReason("EPL AI 모델은 첼시 홈승을 76%로 본다. 시장 배당은 홈 1.22, 무 6.56, 원정 12.70으로 같은 방향이다. MLB·NBA와 달리 무승부가 있어 확률이 갈린다."), null);
  assert.equal(foreignScriptReason("ㅋㅋ 甲 of 甲"), null);
});

test("영문 문장이 대부분이면 거부", () => {
  assert.ok(foreignScriptReason("Chelsea are strong favourites at home against Hull City. The market prices the home win at 1.22 and our model agrees with 76 percent."));
});
