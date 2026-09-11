// UFC 재발급 이벤트 판정 테스트 — 2026-09-11 유령 3행(9/10 옛 id·9/20 새 id) 재현
import assert from "node:assert/strict";
import test from "node:test";
import { findReissuedEventRows } from "./mma-reissued-events";

const row = (id: number, externalId: string, pairKey: string) => ({ id, externalId, pairKey });

test("같은 대진이 새 id 로 들어오고 옛 id 가 피드에서 빠지면 옛 행을 고른다", () => {
  const rows = [
    row(4835046, "old-pantoja", "joshua van|alexandre pantoja"),
    row(4835053, "new-pantoja", "joshua van|alexandre pantoja"),
  ];
  const seen = [{ externalId: "new-pantoja", pairKey: "joshua van|alexandre pantoja" }];
  assert.deepEqual(findReissuedEventRows(rows, seen), [4835046]);
});

test("피드에 그대로 있는 행은 건드리지 않는다", () => {
  const rows = [row(1, "ev-a", "a|b")];
  assert.deepEqual(findReissuedEventRows(rows, [{ externalId: "ev-a", pairKey: "a|b" }]), []);
});

test("피드에서 빠졌어도 같은 대진이 새로 안 들어왔으면 고르지 않는다 — 기존 ESPN 정리 몫", () => {
  const rows = [row(1, "ev-gone", "a|b")];
  assert.deepEqual(findReissuedEventRows(rows, [{ externalId: "ev-other", pairKey: "c|d" }]), []);
});

test("피드가 비면(장애) 아무것도 고르지 않는다", () => {
  const rows = [row(1, "ev-a", "a|b"), row(2, "ev-b", "c|d")];
  assert.deepEqual(findReissuedEventRows(rows, []), []);
});
