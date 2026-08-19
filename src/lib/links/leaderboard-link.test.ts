// 선수 링크가 404 로 나가지 않는지 — id 체계(af 숫자 / ts 문자열)별 목적지 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isTsPlayerId, leaderPlayerHref } from "./leaderboard-link";

test("id 모양으로 체계를 가른다", () => {
  assert.equal(isTsPlayerId("1l4rjnhe7wxm7vx"), true);
  assert.equal(isTsPlayerId("1100"), false);
});

test("축구 ts id 는 /transfers 통합 선수 페이지로 간다", () => {
  // 확장 리그(af 매핑 없음)는 externalId 가 ts player id 로 저장된다.
  assert.equal(leaderPlayerHref("K_LEAGUE_1", "1l4rjnhe7wxm7vx", true), "/transfers/1l4rjnhe7wxm7vx");
  assert.equal(leaderPlayerHref("POLAND_1L", "x7lm7phwpgwm2wd", true), "/transfers/x7lm7phwpgwm2wd");
});

test("축구 af 숫자 id 는 /players 어댑터로 간다 — /transfers 로 보내면 404", () => {
  // 2026-08-20 실측: 빅4·월드컵 리더 198건 중 190건이 af 숫자 id 였고,
  // 리그 이름으로 /transfers 에 몰아주던 때는 그게 전부 404 였다(/transfers/1100 = 404).
  assert.equal(leaderPlayerHref("EPL", "1100", true), "/players/1100?league=EPL");
  assert.equal(leaderPlayerHref("LALIGA", "154", true), "/players/154?league=LALIGA");
  assert.equal(leaderPlayerHref("WORLD_CUP", "276", true), "/players/276?league=WORLD_CUP");
});

test("비축구 리그는 문자열 id 여도 /players 자체 뷰로 간다", () => {
  assert.equal(leaderPlayerHref("LOL", "abc123xyz", false), "/players/abc123xyz?league=LOL");
  assert.equal(leaderPlayerHref("MLB", "665742", false), "/players/665742"); // MLB 는 bare 가 정본
  assert.equal(leaderPlayerHref("KBO", "76232", false), "/players/76232?league=KBO");
});

test("갈 데가 없으면 null — 링크 대신 평문", () => {
  assert.equal(leaderPlayerHref("EPL", null, true), null);
  assert.equal(leaderPlayerHref("KBL", "12345", false), null); // 선수 페이지 미구현
});
