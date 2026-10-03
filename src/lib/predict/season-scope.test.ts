// seasonScopedMatches — 이번 시즌만, 개막 직후엔 지난 시즌, 경계 없는 리그는 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonScopedMatches } from "./season-scope";

const g = (iso: string, h: number, a: number, status = "FINISHED") => ({ startTime: new Date(iso), status, homeTeamId: h, awayTeamId: a });
const hist = [g("2025-10-10T10:00Z", 1, 2), g("2025-11-10T10:00Z", 2, 1), g("2026-02-10T10:00Z", 1, 2), g("2024-12-01T10:00Z", 1, 2)];

test("개막일 — 이번 시즌 경기가 없으면 지난 시즌", () => {
  const r = seasonScopedMatches([...hist, g("2026-10-03T05:00Z", 1, 2, "LIVE")], "KBL", new Date("2026-10-03T05:00Z"), [1, 2]);
  assert.equal(r.label, "지난 시즌");
  assert.equal(r.matches.length, 3); // 2025-26 시즌만(2024-25 제외)
});

test("이번 시즌 3경기 이상이면 이번 시즌만", () => {
  const cur = [g("2026-10-03T05:00Z", 1, 2), g("2026-10-05T05:00Z", 2, 1), g("2026-10-08T05:00Z", 1, 2)];
  const r = seasonScopedMatches([...hist, ...cur], "KBL", new Date("2026-10-10T05:00Z"), [1, 2]);
  assert.equal(r.label, "시즌 전체");
  assert.equal(r.matches.length, 3);
});

test("시즌 경계가 없는 리그는 그대로", () => {
  const r = seasonScopedMatches(hist, "SOME_CUP", new Date("2026-10-03T05:00Z"), [1, 2]);
  assert.equal(r.matches.length, hist.length);
});
