// ts↔af 선수 매핑 왕복 가드 테스트 — af 하나에 ts 둘이 붙은 매핑이 저장 id 로 새지 않게.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tsAfEntries, tsPlayerToAfExact, afPlayerToTs } from "./ts-af-map";

test("tsPlayerToAfExact 는 역방향이 같은 선수를 가리킬 때만 af id 를 준다", () => {
  for (const [ts, af] of tsAfEntries()) {
    assert.equal(tsPlayerToAfExact(ts), afPlayerToTs(af) === ts ? af : null, `ts ${ts} af ${af}`);
  }
});

test("매핑에 없는 ts id 는 null", () => {
  assert.equal(tsPlayerToAfExact("no-such-ts-id"), null);
});
