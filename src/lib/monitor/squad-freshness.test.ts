// 선수단 스냅샷 신선도 판정 고정. 케이스는 production team-squads.json 실측 상태.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeSquadFreshness, SQUAD_STALE_DAYS } from "./squad-freshness";

const NOW = new Date("2026-08-27T07:00:00Z");
const mk = (spec: Array<[string, number]>) => {
  const out: Record<string, { updatedAt: string }> = {};
  let i = 0;
  for (const [date, n] of spec) for (let k = 0; k < n; k++) out[`t${i++}`] = { updatedAt: date };
  return out;
};

test("2026-08-27 실측 상태를 사고로 잡는다 — 177팀 8/15 · 13팀 7/25", () => {
  const r = judgeSquadFreshness(mk([["2026-08-15", 177], ["2026-07-25", 13]]), NOW);
  assert.equal(r.newest, "2026-08-15");
  assert.equal(r.newestAgeDays, 12);
  assert.ok(r.problems.some((p) => p.kind === "squad_snapshot_stale"));
});

test("재빌드 직후는 조용하다 — 대상 밖 13팀이 낡아 있어도 오탐 없음", () => {
  const r = judgeSquadFreshness(mk([["2026-08-27", 177], ["2026-07-25", 13]]), NOW);
  assert.equal(r.newestAgeDays, 0);
  assert.equal(r.teamStale, 13); // 33일 — 상시 잔량
  assert.deepEqual(r.problems, []);
});

test("주 1회를 한 번 걸러도 아직 안 울린다 — 임계는 10일", () => {
  const at = (d: number) => {
    const t = new Date(NOW.getTime() - d * 86400000).toISOString().slice(0, 10);
    return judgeSquadFreshness(mk([[t, 100]]), NOW);
  };
  assert.deepEqual(at(SQUAD_STALE_DAYS).problems, []);
  assert.ok(at(SQUAD_STALE_DAYS + 1).problems.some((p) => p.kind === "squad_snapshot_stale"));
});

test("일부 팀만 눌러앉으면 따로 잡는다 — 빌더는 병합식이라 조용히 낡는다", () => {
  const r = judgeSquadFreshness(mk([["2026-08-27", 100], ["2026-06-01", 60]]), NOW);
  assert.deepEqual(r.problems.map((p) => p.kind), ["squad_team_stale"]);
});

test("파일이 비면 그 자체가 사고", () => {
  const r = judgeSquadFreshness({}, NOW);
  assert.equal(r.teams, 0);
  assert.deepEqual(r.problems.map((p) => p.kind), ["squad_snapshot_empty"]);
});
