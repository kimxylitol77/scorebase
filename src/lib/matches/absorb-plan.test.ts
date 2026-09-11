// 연기 경기 쌍둥이 흡수 계획 테스트 — 2026-09-09 Middlesbrough vs Millwall 충돌 재현 포함
import assert from "node:assert/strict";
import test from "node:test";
import { planTwinAbsorb, type AbsorbInput } from "./absorb-plan";

const emptyTwin: AbsorbInput["twin"] = { picks: [], votes: [], followUserIds: [], oddsSnapshots: 0, hasTsCache: false, betmanOdds: 0 };
const input = (over: Partial<AbsorbInput> = {}): AbsorbInput => ({
  counts: {}, articles: [], picks: [], votes: [], follows: [], ...over, twin: { ...emptyTwin, ...over.twin },
});

test("Middlesbrough 재현 — 게시 프리뷰 1·봇 픽 3·스냅샷 1 은 막지 않고 프리뷰 REJECT·픽 이전", () => {
  const plan = planTwinAbsorb(input({
    counts: { OddsSnapshot: 1, Article: 1, MemberBotPick: 3 },
    articles: [{ id: 4687, type: "PREVIEW", status: "PUBLISHED" }],
    picks: [{ id: 27169, botId: "a", market: "1X2" }, { id: 27170, botId: "b", market: "1X2" }, { id: 27171, botId: "c", market: "1X2" }],
    twin: { ...emptyTwin, oddsSnapshots: 46 },
  }));
  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.rejectArticleIds, [4687]);
  assert.deepEqual(plan.movePickIds, [27169, 27170, 27171]);
  assert.deepEqual(plan.deletePickIds, []);
  assert.equal(plan.moveOddsSnapshots, false, "쌍둥이에 시계열이 있으면 섞지 않는다");
});

test("봇 픽 — 쌍둥이에 같은 봇·같은 시장이 있으면 삭제, 시장이 다르면 이전", () => {
  const plan = planTwinAbsorb(input({
    counts: { MemberBotPick: 2 },
    picks: [{ id: 1, botId: "a", market: "1X2" }, { id: 2, botId: "a", market: "OU" }],
    twin: { ...emptyTwin, picks: [{ botId: "a", market: "1X2" }] },
  }));
  assert.deepEqual(plan.deletePickIds, [1]);
  assert.deepEqual(plan.movePickIds, [2]);
});

test("투표 — 유저·세션 키에 market 포함, 익명(null) 끼리는 충돌하지 않는다", () => {
  const plan = planTwinAbsorb(input({
    counts: { MatchVote: 4 },
    votes: [
      { id: 1, userId: "u1", sessionId: null, market: "1X2" },
      { id: 2, userId: "u1", sessionId: null, market: "HANDICAP" },
      { id: 3, userId: null, sessionId: "s1", market: "1X2" },
      { id: 4, userId: null, sessionId: null, market: "1X2" },
    ],
    twin: { ...emptyTwin, votes: [{ userId: "u1", sessionId: null, market: "1X2" }, { userId: null, sessionId: "s1", market: "1X2" }, { userId: null, sessionId: null, market: "1X2" }] },
  }));
  assert.deepEqual(plan.deleteVoteIds, [1, 3]);
  assert.deepEqual(plan.moveVoteIds, [2, 4]);
});

test("즐겨찾기 — 같은 유저가 쌍둥이를 이미 즐겨찾기했으면 삭제", () => {
  const plan = planTwinAbsorb(input({
    counts: { UserMatchFollow: 2 },
    follows: [{ id: "f1", userId: "u1" }, { id: "f2", userId: "u2" }],
    twin: { ...emptyTwin, followUserIds: ["u1"] },
  }));
  assert.deepEqual(plan.deleteFollowIds, ["f1"]);
  assert.deepEqual(plan.moveFollowIds, ["f2"]);
});

test("알림 발송 기록은 옮기지 않고 삭제 — 새 날짜 킥오프 알림이 다시 나가야 한다", () => {
  assert.equal(planTwinAbsorb(input({ counts: { PushMatchAlert: 2 } })).deleteAlertLogs, true);
  assert.equal(planTwinAbsorb(input({ counts: { TelegramAlertLog: 1 } })).deleteAlertLogs, true);
  assert.equal(planTwinAbsorb(input({ counts: {} })).deleteAlertLogs, false);
});

test("차단 — 종료 후 데이터·프리뷰 외 글·규칙 없는 테이블", () => {
  assert.match(planTwinAbsorb(input({ counts: { MatchStats: 1 } })).blocked.join(), /MatchStats/);
  assert.match(planTwinAbsorb(input({ counts: { BookClosingOdds: 3 } })).blocked.join(), /BookClosingOdds/);
  assert.match(planTwinAbsorb(input({ counts: { NewTable: 1 } })).blocked.join(), /규칙 없는 테이블/);
  assert.match(
    planTwinAbsorb(input({ counts: { Article: 1 }, articles: [{ id: 9, type: "RECAP", status: "PUBLISHED" }] })).blocked.join(),
    /프리뷰 외 글/,
  );
});

test("Cascade 로 버리는 테이블은 막지 않고 할 일도 없다", () => {
  const plan = planTwinAbsorb(input({ counts: { OddsBookSnapshot: 408, AiPrediction: 6, LiveCommentary: 1 } }));
  assert.deepEqual(plan.blocked, []);
  assert.equal(plan.moveOddsSnapshots, false);
});

test("미게시 프리뷰는 REJECT 대상이 아니다", () => {
  const plan = planTwinAbsorb(input({ counts: { Article: 1 }, articles: [{ id: 5, type: "PREVIEW", status: "DRAFT" }] }));
  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.rejectArticleIds, []);
});

test("ts 캐시·베트맨·배당 스냅샷 — 쌍둥이에 없을 때만 이전", () => {
  const empty = planTwinAbsorb(input({ counts: { TheSportsMatchCache: 1, BetmanOdds: 1, OddsSnapshot: 5 } }));
  assert.equal(empty.moveTsCache, true);
  assert.equal(empty.betman, "move");
  assert.equal(empty.moveOddsSnapshots, true);
  const full = planTwinAbsorb(input({
    counts: { TheSportsMatchCache: 1, BetmanOdds: 1, OddsSnapshot: 5 },
    twin: { ...emptyTwin, hasTsCache: true, betmanOdds: 1, oddsSnapshots: 3 },
  }));
  assert.equal(full.moveTsCache, false);
  assert.equal(full.betman, "nullify");
  assert.equal(full.moveOddsSnapshots, false);
});
