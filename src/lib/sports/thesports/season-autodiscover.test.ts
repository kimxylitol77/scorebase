// 시즌 자동 발견 — 대상 선정과 조회 날짜 계산이 감시 판정과 어긋나지 않는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SWEEP_DAYS,
  needsDiscovery,
  pickNewSeason,
  sweepDayOffsets,
} from "./season-autodiscover";
import type { SeasonCandidate } from "./season-discovery";

const NOW = new Date("2026-08-24T00:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86400_000);

const target = (league: string, days: number | null, codes: string[]) => ({
  league,
  firstFixtureAt: days == null ? null : inDays(days),
  issues: codes.map((code) => ({ code })),
});

test("season-watch 가 '개막 임박인데 시즌 없음'으로 잡은 리그만 대상이다", () => {
  const picked = needsDiscovery([
    target("THAI_L1", 11, ["no-season-before-open"]),
    target("EPL", 2, ["cache-stale"]),                    // 다른 사유는 대상 아님
    target("WSL", 5, ["low-mapping", "no-season-before-open"]),
  ]);
  assert.deepEqual(picked.map((p) => p.league), ["THAI_L1", "WSL"]);
});

test("일정이 없으면 대상이 아니다 — 조회할 날짜를 못 정한다", () => {
  assert.equal(needsDiscovery([target("A_LEAGUE", null, ["no-season-before-open"])]).length, 0);
});

test("리그 개막일부터 3일치를 조회한다", () => {
  assert.deepEqual(sweepDayOffsets([target("THAI_L1", 11, [])], NOW), [11, 12, 13]);
});

test("리그가 여럿이면 날짜를 합치고 중복은 한 번만 조회한다", () => {
  // 9/4 개막 두 리그 + 9/6 한 리그 → 11,12,13 + 13,14,15 = 11~15 (13 중복 제거)
  const offsets = sweepDayOffsets(
    [target("THAI_L1", 11, []), target("INDONESIA_L1", 11, []), target("VIETNAM_VL1", 13, [])],
    NOW,
  );
  assert.deepEqual(offsets, [11, 12, 13, 14, 15]);
});

test("개막일이 지났으면 오늘부터 3일치 — 음수 offset 도, span 뭉개짐도 없다", () => {
  assert.deepEqual(sweepDayOffsets([target("CYPRUS_1D", -2, [])], NOW), [0, 1, 2]);
});

test("호출 상한을 넘지 않는다 — 프록시 한 홉을 공유하므로 버스트 금지", () => {
  const many = Array.from({ length: 10 }, (_, i) => target(`L${i}`, i * 3, []));
  assert.equal(sweepDayOffsets(many, NOW).length, MAX_SWEEP_DAYS);
});

const cand = (seasonId: string, future: number): SeasonCandidate => ({
  competitionId: "comp1", seasonId, matchCount: future, futureMatchCount: future,
  firstMatchTime: 0, lastMatchTime: 0, teamIds: [], sampleMatchIds: [],
});

test("후보는 collectSeasonCandidates 정렬을 믿고 맨 앞을 쓴다", () => {
  // 이미 "미래 경기 많은 순"으로 정렬돼 온다 — 여기서 다시 정렬하면 규칙이 두 벌이 된다.
  const m = new Map([["comp1", [cand("new", 24), cand("old", 0)]]]);
  assert.equal(pickNewSeason(m, "comp1")?.seasonId, "new");
  assert.equal(pickNewSeason(m, "없는대회"), null);
});
