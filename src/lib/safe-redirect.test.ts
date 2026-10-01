// 열린 리다이렉트 방지 함수 테스트 — 백슬래시·프로토콜 상대·절대 주소 우회를 막고 정상 경로는 그대로
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirectPath } from "./safe-redirect";

test("사이트 안 경로는 그대로", () => {
  assert.equal(safeRedirectPath("/scores?sport=baseball#top"), "/scores?sport=baseball#top");
  assert.equal(safeRedirectPath("/"), "/");
});

test("다른 사이트로 빠지는 값은 전부 /", () => {
  for (const v of ["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/\t/evil.com"]) {
    assert.equal(safeRedirectPath(v), "/", v);
  }
  // 스킴만 붙은 상대 표기는 우리 사이트 안 경로로 풀린다 — 밖으로 나가지 않으면 통과
  assert.equal(safeRedirectPath("http:evil.com"), "/evil.com");
  assert.equal(safeRedirectPath(null), "/");
  assert.equal(safeRedirectPath(""), "/");
});
