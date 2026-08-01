// 발행 게이트 회귀 테스트 — 기존 규칙 ①② 보존 + ③ OU 실측 통과제 (2026-08-01 교체).
//
// ③ 의 역사: "scorebase 외 전 모델 차단"(07-19 백테스트 44~48%)이 out-of-sample 재검증
// (가동 후 1,305건: 전 모델 50.7~58.5%)에서 기각됐다. 고정 명단 대신 그림자 실측이
// 기준(n>=120 && acc>=50%)을 넘는 모델만 발행한다. 실측이 없으면 기존처럼 차단(fail-closed).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OU_SHADOW_MIN_ACC,
  OU_SHADOW_MIN_N,
  shouldPublishPick,
  type MatchOddsCtx,
  type OuShadowStat,
} from "./publish-gate";

// 홈이 시장 우세인 축구 컨텍스트
const soccerCtx: MatchOddsCtx = {
  league: "EPL",
  marketHome: 0.55, marketDraw: 0.25, marketAway: 0.2,
  oddsHome: null, oddsDraw: null, oddsAway: null,
};
const baseballCtx: MatchOddsCtx = {
  league: "MLB",
  marketHome: null, marketDraw: null, marketAway: null,
  oddsHome: 1.7, oddsDraw: null, oddsAway: 2.2,
};

const stats = (entries: Array<[string, OuShadowStat]>) => new Map(entries);

test("OU: scorebase 앵커는 실측 없이도 항상 발행", () => {
  assert.equal(shouldPublishPick("scorebase", "OU", "OVER", 0.55, 8.5, baseballCtx).ok, true);
  assert.equal(shouldPublishPick("scorebase", "OU", "OVER", 0.55, 8.5, baseballCtx, null).ok, true);
});

test("OU: 실측 미제공이면 기존 일괄 차단과 동일 — fail-closed", () => {
  const r = shouldPublishPick("claude", "OU", "OVER", 0.6, 8.5, baseballCtx);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "OU_WEAK_MODEL");
  // 명시적 null (조회 실패 폴백) 도 동일
  assert.equal(shouldPublishPick("claude", "OU", "OVER", 0.6, 8.5, baseballCtx, null).ok, false);
});

test("OU: 실측이 기준(n>=120, acc>=50%)을 넘는 모델은 발행된다", () => {
  const s = stats([["gpt-5.6", { n: 142, acc: 0.585 }]]);
  assert.equal(shouldPublishPick("gpt-5.6", "OU", "UNDER", 0.55, 8.5, baseballCtx, s).ok, true);
});

test("OU: 코인토스 아래 실측이면 차단 유지", () => {
  const s = stats([["gemini", { n: 300, acc: 0.485 }]]);
  assert.equal(shouldPublishPick("gemini", "OU", "OVER", 0.6, 8.5, baseballCtx, s).ok, false);
});

test("OU: 표본 부족(n<120)이면 성적이 좋아도 아직 차단 — 신규 좌석 보수 운영", () => {
  const s = stats([["new-model", { n: 40, acc: 0.7 }]]);
  assert.equal(shouldPublishPick("new-model", "OU", "OVER", 0.6, 8.5, baseballCtx, s).ok, false);
});

test("OU: 실측에 그 모델이 아예 없으면 차단", () => {
  const s = stats([["gpt-5.6", { n: 200, acc: 0.55 }]]);
  assert.equal(shouldPublishPick("brand-new", "OU", "OVER", 0.6, 8.5, baseballCtx, s).ok, false);
});

test("OU: 경계값 — 정확히 n=120, acc=50% 는 통과", () => {
  const s = stats([["edge", { n: OU_SHADOW_MIN_N, acc: OU_SHADOW_MIN_ACC }]]);
  assert.equal(shouldPublishPick("edge", "OU", "OVER", 0.6, 8.5, baseballCtx, s).ok, true);
});

// ── 기존 규칙 ①② 보존 확인 ──────────────────────────────

test("1X2: 시장 역행 + 저확신은 차단, 확신 60% 이상이면 발행", () => {
  // 시장 우세 HOME 인데 AWAY 픽
  const low = shouldPublishPick("claude", "1X2", "AWAY", 0.45, null, soccerCtx);
  assert.equal(low.ok, false);
  if (!low.ok) assert.equal(low.reason, "1X2_AGAINST_MARKET_LOWCONF");
  assert.equal(shouldPublishPick("claude", "1X2", "AWAY", 0.65, null, soccerCtx).ok, true);
  // 시장 순응 픽은 확신 무관 발행
  assert.equal(shouldPublishPick("claude", "1X2", "HOME", 0.4, null, soccerCtx).ok, true);
});

test("핸디: 야구 HOME(-1.5 커버)만 차단 — AWAY·축구는 그대로", () => {
  const blocked = shouldPublishPick("grok", "HANDICAP", "HOME", 0.55, 1.5, baseballCtx);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "HC_HOME_COVER_NO_SKILL");
  assert.equal(shouldPublishPick("grok", "HANDICAP", "AWAY", 0.55, 1.5, baseballCtx).ok, true);
  assert.equal(shouldPublishPick("grok", "HANDICAP", "HOME", 0.55, 1.5, soccerCtx).ok, true);
});

test("킬스위치 — PREDICTION_PUBLISH_GATES=off 면 전부 발행", () => {
  const prev = process.env.PREDICTION_PUBLISH_GATES;
  process.env.PREDICTION_PUBLISH_GATES = "off";
  try {
    assert.equal(shouldPublishPick("gemini", "OU", "OVER", 0.6, 8.5, baseballCtx).ok, true);
    assert.equal(shouldPublishPick("claude", "1X2", "AWAY", 0.45, null, soccerCtx).ok, true);
  } finally {
    if (prev === undefined) delete process.env.PREDICTION_PUBLISH_GATES;
    else process.env.PREDICTION_PUBLISH_GATES = prev;
  }
});
