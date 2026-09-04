// AI 기사 발행 정합 게이트 테스트 — 2026-09-03 감사에서 실제로 잡힌 오류 3종을 재현하고, 정상 글은 통과시킨다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkArticleGate, sportOfLeague } from "./publish-gate";

const wp = { home: 0.43, draw: 0.27, away: 0.3 };

test("종목 판별", () => {
  assert.equal(sportOfLeague("EPL"), "soccer");
  assert.equal(sportOfLeague("MLB"), "baseball");
  assert.equal(sportOfLeague("NBA"), "basketball");
});

test("야구 글의 '강등' — 감사에서 잡힌 MLB 프리뷰 오류", () => {
  const r = checkArticleGate({
    content: "플레이오프 진출권을 놓고 벌이는 실질적 강등전에 가까운 경기다.",
    league: "MLB",
    mode: "preview",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reasons[0], /강등/);
});

test("무승부가 없는 리그에 무승부 언급은 막고, 있는 리그(KBO)는 통과", () => {
  const nba = checkArticleGate({ content: "무승부 가능성도 있다.", league: "NBA", mode: "preview" });
  assert.equal(nba.ok, false);
  const kbo = checkArticleGate({ content: "연장 12회까지 가면 무승부로 끝날 수 있다.", league: "KBO", mode: "preview" });
  assert.equal(kbo.ok, true);
});

test("본문 모델 승률이 저장 승률과 다르면 차단 (53/54/59% 세 갈래 사례)", () => {
  const r = checkArticleGate({
    content: "통계 모델은 원정 승리를 59%로 추정한다. 홈 승률은 43%다.",
    league: "LALIGA",
    mode: "preview",
    winProb: wp,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reasons[0], /59%/);
});

test("모델 승률과 일치하거나(±1) 폼 통계·%p 는 통과", () => {
  const r = checkArticleGate({
    content:
      "모델 추정 승률은 홈 43%, 무 27%, 원정 30%다. 최근 5경기 승률은 80%로 폼이 좋다. 두 팀의 승률 격차는 13%p다. 예측 승률 44%로 근소 우위.",
    league: "LALIGA",
    mode: "preview",
    winProb: wp,
  });
  assert.equal(r.ok, true);
});

test("부상 데이터를 주지 않은 축구 글의 '결장자 6명' 은 지어낸 것 — 차단", () => {
  const r = checkArticleGate({
    content: "레알 소시에다드는 6명의 결장자가 있어 로테이션이 불가피하다.",
    league: "LALIGA",
    mode: "preview",
    injuries: null,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reasons[0], /근거 없는 결장자/);
});

test("명단을 준 경우 홈·원정·합계 중 하나와 맞으면 통과, 아니면 차단", () => {
  const injuries = { home: [{}, {}], away: [{}] };
  const ok = checkArticleGate({ content: "홈팀은 결장자 2명, 양 팀 합쳐 3명이 빠진다.", league: "KBO", mode: "preview", injuries });
  assert.equal(ok.ok, true);
  const bad = checkArticleGate({ content: "홈팀 결장자 5명.", league: "KBO", mode: "preview", injuries });
  assert.equal(bad.ok, false);
});

test("recap 은 금칙어만 본다 — 결장 수·승률 문장이 있어도 통과", () => {
  const r = checkArticleGate({
    content: "결장자 4명 속에서도 모델 예측 승률 70%를 뒤집었다.",
    league: "EPL",
    mode: "recap",
    winProb: wp,
    injuries: null,
  });
  assert.equal(r.ok, true);
});

test("정상 프리뷰는 통과", () => {
  const r = checkArticleGate({
    content:
      "레알 소시에다드 vs 셀타 비고. 모델 승률은 홈 43%·무 27%·원정 30%다. Elo 격차 9점으로 대등하지만 5일 휴식 우위가 홈팀 쪽으로 기울였다.",
    league: "LALIGA",
    mode: "preview",
    winProb: wp,
    injuries: null,
  });
  assert.equal(r.ok, true);
});
