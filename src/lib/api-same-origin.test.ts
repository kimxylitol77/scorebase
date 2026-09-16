// 같은 출처 검사 테스트 — 경로 판정·헤더 조합·내부 토큰
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtectedApiPath, isSameSiteRequest } from "./api-same-origin";

const H = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("보호 경로 — 내부 JSON 만, live/scores 와 공개 라우트는 제외", () => {
  assert.equal(isProtectedApiPath("/api/matches/by-ids"), true);
  assert.equal(isProtectedApiPath("/api/live/mlb-boxscore/123"), true);
  assert.equal(isProtectedApiPath("/api/bot-backtest"), true);
  assert.equal(isProtectedApiPath("/api/live/scores"), false);
  assert.equal(isProtectedApiPath("/api/public/standings"), false);
  assert.equal(isProtectedApiPath("/api/embed/scoreboard"), false);
  assert.equal(isProtectedApiPath("/api/v1/teams"), false);
  assert.equal(isProtectedApiPath("/scores"), false);
});

test("헤더 판정 — 브라우저 same-origin 통과, curl·타 사이트·직접 입력 거절, Referer 폴백, 내부 토큰", () => {
  assert.equal(isSameSiteRequest(H({ "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameSiteRequest(H({ "sec-fetch-site": "cross-site", referer: "https://www.scorebase.kr/x" })), false);
  assert.equal(isSameSiteRequest(H({ "sec-fetch-site": "none" })), false);
  assert.equal(isSameSiteRequest(H({})), false);
  assert.equal(isSameSiteRequest(H({ referer: "https://www.scorebase.kr/scores" })), true);
  assert.equal(isSameSiteRequest(H({ origin: "https://xn--hy1bm7m1yevrd8pq.kr" })), true);
  assert.equal(isSameSiteRequest(H({ referer: "https://evil.example/scorebase.kr" })), false);
  assert.equal(isSameSiteRequest(H({ authorization: "Bearer tok" }), "tok"), true);
  assert.equal(isSameSiteRequest(H({ authorization: "Bearer nope" }), "tok"), false);
});
