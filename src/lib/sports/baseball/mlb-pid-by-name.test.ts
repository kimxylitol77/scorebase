// MLB 이름→번호 사전 테스트 — 영문·한글 키, 동명이인 제외
import { test } from "node:test";
import assert from "node:assert/strict";
import { mlbPidByName } from "./mlb-pid-by-name";

test("영문 이름과 한글 표시 이름 둘 다 번호로 찾는다", () => {
  const m = mlbPidByName([{ pid: 695578, name: "James Wood" }], { 695578: "제임스 우드" });
  assert.equal(m["James Wood"], 695578);
  assert.equal(m["제임스 우드"], 695578);
});

test("같은 이름이 두 선수면 링크하지 않는다", () => {
  const m = mlbPidByName([
    { pid: 1, name: "Will Smith" },
    { pid: 2, name: "Will Smith" },
    { pid: 3, name: "Luis Garcia" },
  ]);
  assert.equal(m["Will Smith"], undefined);
  assert.equal(m["Luis Garcia"], 3);
});

test("같은 선수가 타자·투수 목록에 두 번 나와도 유지된다", () => {
  const m = mlbPidByName([{ pid: 660271, name: "Shohei Ohtani" }, { pid: 660271, name: "Shohei Ohtani" }], { 660271: "오타니 쇼헤이" });
  assert.equal(m["Shohei Ohtani"], 660271);
  assert.equal(m["오타니 쇼헤이"], 660271);
});
