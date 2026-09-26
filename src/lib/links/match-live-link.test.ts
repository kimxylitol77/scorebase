// 경기 상세 링크가 404·불필요한 308 로 나가지 않는지 — 리그별 라우트 규칙 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLiveHref } from "./match-live-link";

test("야구는 소문자 전용 라우트 + externalId", () => {
  assert.equal(matchLiveHref("KBO", "182007", 2567), "/live/kbo/182007");
  assert.equal(matchLiveHref("MLB", "401816970"), "/live/mlb/401816970");
});

test("e스포츠는 /live/lol 하나로", () => {
  assert.equal(matchLiveHref("LCK_CL", "xwrx81u3wkkjqyk"), "/live/lol/xwrx81u3wkkjqyk");
});

test("그 밖의 리그는 대문자 리그 코드 + externalId — 내부 id 를 쓰면 404", () => {
  assert.equal(matchLiveHref("WNBA", "494800", 241955), "/live/WNBA/494800");
  assert.equal(matchLiveHref("EFL_CUP", "ts-abc", 10881666), "/live/EFL_CUP/ts-abc");
});

test("UFC 만 내부 id 로 찾는다", () => {
  assert.equal(matchLiveHref("UFC", "hash123", 777), "/live/ufc/777");
});
