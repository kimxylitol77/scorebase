// jsonLdScript 이스케이프 회귀 테스트 — DB 문자열이 <script> 태그를 탈출하지 못하는지 확인.
import assert from "node:assert/strict";
import test from "node:test";
import { jsonLdScript, breadcrumbLd, athleteLd } from "./jsonld";

test("</script><script> 문자열이 HTML 태그를 탈출하지 못한다", () => {
  const payload = jsonLdScript({
    name: '</script><script>alert(1)</script>',
  });
  assert.equal(payload.includes("</script"), false);
  assert.equal(payload.includes("<script"), false);
  assert.equal(payload.includes("<"), false);
  assert.equal(payload.includes(">"), false);
  assert.match(payload, /\\u003c\\u002fscript\\u003e|\\u003c\/script\\u003e/);
});

test("이스케이프해도 JSON 값은 원문 그대로 복원된다", () => {
  const original = {
    name: '</script><script>alert("x")</script>',
    note: "a & b < c > d",
  };
  assert.deepEqual(JSON.parse(jsonLdScript(original)), original);
});

test("& 와 U+2028/U+2029 도 이스케이프한다", () => {
  const payload = jsonLdScript({ a: "x&y", b: "line\u2028break", c: "para\u2029break" });
  assert.equal(payload.includes("&"), false);
  assert.equal(payload.includes("\u2028"), false);
  assert.equal(payload.includes("\u2029"), false);
  assert.deepEqual(JSON.parse(payload), { a: "x&y", b: "line\u2028break", c: "para\u2029break" });
});

test("실제 빌더 결과에 주입 문자열이 들어와도 안전하다", () => {
  const payload = jsonLdScript(
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: '</script><img src=x onerror=alert(1)>', path: "/teams/1" },
    ]),
  );
  assert.equal(payload.includes("<"), false);
  assert.equal(payload.includes(">"), false);
});

test("선수 Person 빌더도 같은 보호를 받는다", () => {
  const payload = jsonLdScript(
    athleteLd({ name: '손흥민</script><script>x</script>', path: "/players/1" }),
  );
  assert.equal(payload.includes("</script"), false);
  assert.equal(JSON.parse(payload).name, '손흥민</script><script>x</script>');
});
