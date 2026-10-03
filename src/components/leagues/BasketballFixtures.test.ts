// earlyGapPreseasonIds — 시즌 앞쪽의 긴 공백 앞 경기만 시즌 전 경기로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { earlyGapPreseasonIds } from "./BasketballFixtures";

const at = (id: number, iso: string) => ({ id, startTime: new Date(iso) });
const season = (n: number, from: string) =>
  Array.from({ length: n }, (_, i) => at(100 + i, new Date(Date.parse(from) + i * 86400_000).toISOString()));

test("7월 대회 2경기 뒤 11월 개막 — 앞 2경기만 시즌 전", () => {
  const rows = [at(1, "2026-07-31T05:00Z"), at(2, "2026-07-31T07:00Z"), ...season(20, "2026-11-01T10:00Z")];
  assert.deepEqual(earlyGapPreseasonIds(rows), [1, 2]);
});

test("시즌 중반 휴식(올스타)은 보지 않는다", () => {
  const rows = [...season(10, "2026-10-03T05:00Z"), at(9, "2027-01-20T05:00Z"), ...season(5, "2027-01-21T05:00Z")];
  assert.deepEqual(earlyGapPreseasonIds(rows), []);
});
