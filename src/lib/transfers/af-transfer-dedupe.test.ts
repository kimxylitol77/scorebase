// af 이적 중복 정리 고정 — 케이스는 production af transfers?team=85 실측값.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeAfTransfers } from "./af-transfer-dedupe";

const row = (playerId: number, date: string, inId: number, outId: number, type = "Transfer") =>
  ({ playerId, date, inId, outId, type });

test("같은 이적이 이틀 연속으로 오면 한 건으로 — 2026-08-13·14 PSG 실측", () => {
  const out = dedupeAfTransfers([
    row(340153, "2026-08-14", 85, 194), // M. Godts ← Ajax
    row(340153, "2026-08-13", 85, 194),
    row(931, "2026-08-14", 85, 529), // Ferran Torres ← Barcelona
    row(931, "2026-08-13", 85, 529),
  ]);
  assert.equal(out.length, 2);
  // 이른 날짜를 남긴다 — af 가 재기록해도 날짜가 밀리지 않게
  assert.deepEqual(out.map((r) => r.date).sort(), ["2026-08-13", "2026-08-13"]);
});

test("간격이 벌어진 같은 조합은 별건으로 남긴다 — 임대 갔다 1년 뒤 복귀", () => {
  const out = dedupeAfTransfers([
    row(1264, "2014-07-01", 85, 3006, "N/A"),
    row(1264, "2015-06-01", 85, 3006, "N/A"),
  ]);
  assert.equal(out.length, 2);
});

test("경계 — 7일은 같은 건, 8일은 별건", () => {
  assert.equal(dedupeAfTransfers([row(1, "2026-08-01", 10, 20), row(1, "2026-08-08", 10, 20)]).length, 1);
  assert.equal(dedupeAfTransfers([row(1, "2026-08-01", 10, 20), row(1, "2026-08-09", 10, 20)]).length, 2);
});

test("유형이 다르면 합치지 않는다 — 임대 뒤 완전이적", () => {
  const out = dedupeAfTransfers([
    row(7, "2026-08-01", 10, 20, "Loan"),
    row(7, "2026-08-02", 10, 20, "Transfer"),
  ]);
  assert.equal(out.length, 2);
});

test("방향이 다르면 합치지 않는다 — 영입과 방출은 별개", () => {
  const out = dedupeAfTransfers([
    row(7, "2026-08-01", 10, 20),
    row(7, "2026-08-02", 20, 10),
  ]);
  assert.equal(out.length, 2);
});

test("빈 입력·단건은 그대로", () => {
  assert.deepEqual(dedupeAfTransfers([]), []);
  assert.equal(dedupeAfTransfers([row(1, "2026-08-01", 10, 20)]).length, 1);
});
