// parseSnsUrl — 허용 3개 플랫폼 주소 정규화와 그 밖의 주소 거부.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSnsUrl } from "./sns-embed";

test("인스타그램 게시물·릴스·계정 경로를 같은 정규 주소로 만든다", () => {
  for (const raw of [
    "https://www.instagram.com/p/DAbc_12-x/?igsh=abc",
    "https://instagram.com/reel/DAbc_12-x/",
    "https://www.instagram.com/someone/p/DAbc_12-x/?img_index=1",
  ]) {
    const r = parseSnsUrl(raw);
    assert.equal(r?.platform, "instagram");
    assert.equal(r?.url, "https://www.instagram.com/p/DAbc_12-x/");
    assert.equal(r?.embedUrl, "https://www.instagram.com/p/DAbc_12-x/embed/");
  }
});

test("X·트위터 주소는 글 번호로 임베드 주소를 만든다", () => {
  const a = parseSnsUrl("https://twitter.com/user_1/status/1801234567890123456?s=20");
  const b = parseSnsUrl("https://x.com/user_1/status/1801234567890123456/photo/1");
  assert.equal(a?.url, "https://x.com/user_1/status/1801234567890123456");
  assert.equal(b?.url, a?.url);
  assert.match(a!.embedUrl, /^https:\/\/platform\.twitter\.com\/embed\/Tweet\.html\?id=1801234567890123456&/);
});

test("Threads 는 .net·.com 둘 다 받는다", () => {
  const a = parseSnsUrl("https://www.threads.net/@some.user/post/C8abcDEF?xmt=1");
  const b = parseSnsUrl("https://www.threads.com/@some.user/post/C8abcDEF");
  assert.equal(a?.platform, "threads");
  assert.equal(a?.url, b?.url);
  assert.equal(a?.embedUrl, "https://www.threads.net/@some.user/post/C8abcDEF/embed");
});

test("허용하지 않는 주소는 null", () => {
  for (const raw of [
    "",
    "not a url",
    "http://www.instagram.com/p/abc/",
    "https://www.instagram.com/someone/",
    "https://x.com/user/status/abc",
    "https://evil.com/p/abc/",
    "https://instagram.com.evil.com/p/abc/",
    "https://www.threads.net/@user",
    "javascript:alert(1)",
  ]) {
    assert.equal(parseSnsUrl(raw), null, raw);
  }
});
