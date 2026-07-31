// 시즌 후보 발견 + 전환 검증 규칙.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectSeasonCandidates,
  verifySeasonCandidate,
  type DiscoveryMatch,
  type SeasonCandidate,
} from "./season-discovery";

const NOW = Math.floor(Date.parse("2026-07-31T00:00:00Z") / 1000);
const DAY = 86400;
const EPL_COMP = "jednm9whz0ryox8";

function match(over: Partial<DiscoveryMatch> = {}): DiscoveryMatch {
  return {
    competition_id: EPL_COMP,
    season_id: "new-season",
    match_time: NOW + 20 * DAY,
    home_team_id: "t1",
    away_team_id: "t2",
    ...over,
  };
}

function candidate(over: Partial<SeasonCandidate> = {}): SeasonCandidate {
  return {
    competitionId: EPL_COMP,
    seasonId: "new-season",
    matchCount: 20,
    futureMatchCount: 20,
    firstMatchTime: NOW + 20 * DAY,
    lastMatchTime: NOW + 250 * DAY,
    teamIds: Array.from({ length: 20 }, (_, i) => `t${i}`),
    sampleMatchIds: [],
    ...over,
  };
}

const allMapped = (c: SeasonCandidate) => new Set(c.teamIds);

test("같은 대회의 두 시즌이 섞여 있으면 향후 경기 많은 쪽이 앞에 온다", () => {
  const matches = [
    match({ season_id: "old", match_time: NOW - 40 * DAY }),
    match({ season_id: "old", match_time: NOW - 30 * DAY }),
    match({ season_id: "old", match_time: NOW - 20 * DAY }),
    match({ season_id: "new", match_time: NOW + 10 * DAY }),
    match({ season_id: "new", match_time: NOW + 17 * DAY }),
  ];
  const byComp = collectSeasonCandidates(matches, NOW);
  const list = byComp.get(EPL_COMP)!;
  assert.equal(list.length, 2);
  assert.equal(list[0].seasonId, "new");
  assert.equal(list[0].futureMatchCount, 2);
  assert.equal(list[1].futureMatchCount, 0);
});

test("후보 집계는 참가팀을 중복 없이 모은다", () => {
  const byComp = collectSeasonCandidates(
    [
      match({ home_team_id: "a", away_team_id: "b" }),
      match({ home_team_id: "b", away_team_id: "c" }),
    ],
    NOW,
  );
  assert.deepEqual(byComp.get(EPL_COMP)![0].teamIds.sort(), ["a", "b", "c"]);
});

test("정상 후보는 검증을 통과한다", () => {
  const c = candidate();
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: "old-season",
    knownTeamIds: allMapped(c),
    standingsProbe: "EMPTY", // 개막 전이라 표 없음 = 정상
    nowSec: NOW,
  });
  assert.equal(v.ok, true, v.blockers.join(","));
  assert.equal(v.seasonYear, 2026);
  assert.equal(v.seasonLabel, "2026-27");
});

test("이미 ACTIVE 인 시즌은 새 후보로 통과하지 않는다", () => {
  const c = candidate();
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: "new-season",
    knownTeamIds: allMapped(c),
    standingsProbe: "OK",
    nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("new-season-id"));
});

test("대회 id 가 다르면 거부한다 — 이름 비슷한 다른 대회 오탐 방지", () => {
  const c = candidate({ competitionId: "someone-elses-cup" });
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: allMapped(c),
    standingsProbe: "EMPTY",
    nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("competition-match"));
});

test("향후 경기가 없으면 거부한다", () => {
  const c = candidate({ futureMatchCount: 0, firstMatchTime: NOW - 300 * DAY, lastMatchTime: NOW - 60 * DAY });
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: allMapped(c),
    standingsProbe: "OK",
    nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("future-fixtures"));
});

test("팀 매핑률 95% 미만이면 전환을 거부한다", () => {
  const c = candidate();
  const partial = new Set(c.teamIds.slice(0, 18)); // 18/20 = 90%
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: partial,
    standingsProbe: "EMPTY",
    nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("team-mapping-rate"));
  assert.equal(v.mappedTeamCount, 18);
  assert.ok(Math.abs(v.mappingRate - 0.9) < 1e-9);
});

test("참가팀이 비정상적으로 적으면 거부한다", () => {
  const c = candidate({ teamIds: ["a", "b"] });
  const v = verifySeasonCandidate({
    league: "EPL",
    expectedCompetitionId: EPL_COMP,
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: allMapped(c),
    standingsProbe: "EMPTY",
    nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("team-count"));
});

test("개막 전 빈 순위표는 정상, 개막 후 빈 순위표는 거부", () => {
  const pre = candidate({ firstMatchTime: NOW + 10 * DAY });
  const preV = verifySeasonCandidate({
    league: "EPL", expectedCompetitionId: EPL_COMP, candidate: pre,
    currentActiveSeasonId: null, knownTeamIds: allMapped(pre),
    standingsProbe: "EMPTY", nowSec: NOW,
  });
  assert.equal(preV.checks.find((c) => c.name === "standings")!.ok, true);

  const started = candidate({ firstMatchTime: NOW - 10 * DAY });
  const startedV = verifySeasonCandidate({
    league: "EPL", expectedCompetitionId: EPL_COMP, candidate: started,
    currentActiveSeasonId: null, knownTeamIds: allMapped(started),
    standingsProbe: "EMPTY", nowSec: NOW,
  });
  assert.equal(startedV.checks.find((c) => c.name === "standings")!.ok, false);
  assert.ok(startedV.blockers.includes("standings"));
});

test("친선은 순위표 검증에서 제외된다", () => {
  const c = candidate({ teamIds: ["a", "b"], competitionId: "gpxwrxlhgpryk0j" });
  const v = verifySeasonCandidate({
    league: "CLUB_FRIENDLY",
    expectedCompetitionId: "gpxwrxlhgpryk0j",
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: allMapped(c),
    standingsProbe: "ERROR", // 순위 API 가 죽어 있어도 친선은 통과해야 한다
    nowSec: NOW,
  });
  assert.equal(v.checks.find((x) => x.name === "standings")!.ok, true);
  assert.equal(v.ok, true, v.blockers.join(","));
});

test("컵대회는 단계마다 팀 수가 달라 리그보다 느슨하게 본다", () => {
  const c = candidate({ teamIds: ["a", "b", "c", "d"], competitionId: "ucl-comp" });
  const v = verifySeasonCandidate({
    league: "UCL",
    expectedCompetitionId: "ucl-comp",
    candidate: c,
    currentActiveSeasonId: null,
    knownTeamIds: allMapped(c),
    standingsProbe: "EMPTY", // 녹아웃/예선 단계 — 표 없음이 정상
    nowSec: NOW,
  });
  assert.equal(v.ok, true, v.blockers.join(","));
});

test("개막이 한참 먼 시즌은 선취 전환을 막는다", () => {
  const c = candidate({ firstMatchTime: NOW + 200 * DAY, lastMatchTime: NOW + 400 * DAY });
  const v = verifySeasonCandidate({
    league: "EPL", expectedCompetitionId: EPL_COMP, candidate: c,
    currentActiveSeasonId: null, knownTeamIds: allMapped(c),
    standingsProbe: "EMPTY", nowSec: NOW,
  });
  assert.equal(v.ok, false);
  assert.ok(v.blockers.includes("season-start-sanity"));
});
