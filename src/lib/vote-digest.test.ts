// 채점 결과 다이제스트 문안 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVoteDigest } from "./vote-digest";

test("적중 수·누적·랭킹·8표 초과 접기", () => {
  const votes = Array.from({ length: 10 }, (_, i) => ({ league: "EPL", home: "A", away: "B", market: "1X2" as const, pick: "home", line: null, correct: i % 2 === 0 }));
  const t = buildVoteDigest({ votes, totalAll: 46, hitAll: 31, rankAll: 4, rankedCount: 22, rankMonth: 2, siteUrl: "https://s", leagueLabel: (l) => l, esc: (s) => s });
  assert.ok(t.includes("10표 중 <b>5표 적중</b> (누적 31/46 · 67%)"));
  assert.ok(t.includes("외 2표"));
  assert.ok(t.includes("전체 4위 / 22명 · 이번 달 2위"));
  assert.ok(t.includes("✅ EPL A vs B — 승부 A"));
  const u = buildVoteDigest({ votes: votes.slice(0, 1), totalAll: 1, hitAll: 1, rankAll: null, rankedCount: 0, rankMonth: null, siteUrl: "https://s", leagueLabel: (l) => l, esc: (s) => s });
  assert.ok(u.includes("채점 3표부터"));
});
