import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEspnNbaStandings,
  isCompleteStandings,
  resolveStandingsWithCache,
  type BasketballStandingRow,
  type StandingsCacheStore,
} from "./basketball-standings";

test("ESPN NBA 동서부 순위를 공개 순위 행으로 변환한다", () => {
  const rows = parseEspnNbaStandings({
    children: [
      {
        name: "Eastern Conference",
        standings: {
          entries: [
            {
              team: {
                id: "8",
                displayName: "Detroit Pistons",
                abbreviation: "DET",
              },
              stats: [
                { name: "wins", value: 60 },
                { name: "losses", value: 22 },
                { name: "playoffSeed", value: 1 },
                { name: "gamesBehind", value: 0 },
              ],
            },
            {
              team: {
                id: "2",
                displayName: "Boston Celtics",
                abbreviation: "BOS",
                logos: [{ href: "https://example.com/bos.png" }],
              },
              stats: [
                { name: "wins", value: 56 },
                { name: "losses", value: 26 },
                { name: "playoffSeed", value: 2 },
                { name: "gamesBehind", value: 4 },
                { name: "pointsFor", value: 9418 },
                { name: "pointsAgainst", value: 8787 },
              ],
            },
          ],
        },
      },
      {
        name: "Western Conference",
        standings: {
          entries: [
            {
              team: {
                id: "25",
                displayName: "Oklahoma City Thunder",
                abbreviation: "OKC",
              },
              stats: [
                { name: "wins", value: 68 },
                { name: "losses", value: 14 },
                { name: "playoffSeed", value: 1 },
                { name: "gamesBehind", value: 0 },
              ],
            },
          ],
        },
      },
    ],
  });

  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], {
    position: 2,
    ourTeamId: 9_000_002,
    played: 82,
    wins: 56,
    losses: 26,
    scored: 9418,
    conceded: 8787,
    difference: 631,
    gamesBehind: 4,
    teamName: "Boston Celtics",
    shortName: "BOS",
    logoUrl: "https://example.com/bos.png",
    group: "동부 컨퍼런스",
  });
  assert.equal(rows[2].group, "서부 컨퍼런스");
  assert.equal(rows[2].position, 1);
  assert.equal(rows[2].gamesBehind, 0);
});

test("플레이인 결과로 변한 시드보다 정규시즌 승수를 우선한다", () => {
  const rows = parseEspnNbaStandings({
    children: [{
      name: "Western Conference",
      standings: {
        entries: [
          {
            team: { id: "22", displayName: "Portland Trail Blazers" },
            stats: [
              { name: "wins", value: 42 },
              { name: "losses", value: 40 },
              { name: "playoffSeed", value: 7 },
            ],
          },
          {
            team: { id: "21", displayName: "Phoenix Suns" },
            stats: [
              { name: "wins", value: 45 },
              { name: "losses", value: 37 },
              { name: "playoffSeed", value: 8 },
            ],
          },
          {
            team: { id: "12", displayName: "LA Clippers" },
            stats: [
              { name: "wins", value: 42 },
              { name: "losses", value: 40 },
              { name: "playoffSeed", value: 9 },
            ],
          },
        ],
      },
    }],
  });

  assert.deepEqual(
    rows.map((row) => [row.position, row.teamName]),
    [
      [1, "Phoenix Suns"],
      [2, "Portland Trail Blazers"],
      [3, "LA Clippers"],
    ],
  );
});

// === 장애 처리 — ESPN 실패 / 부분 응답 / 정상 30팀 ===

function nbaRows(count: number): BasketballStandingRow[] {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    ourTeamId: 9_000_000 + i,
    played: 82,
    wins: 60 - i,
    losses: 22 + i,
    scored: null,
    conceded: null,
    difference: null,
    gamesBehind: null,
    teamName: `Team ${i + 1}`,
    group: "동부 컨퍼런스",
  }));
}

function fakeCache(seed?: { rows: BasketballStandingRow[]; fetchedAt: Date }) {
  const state = { current: seed ?? null, writes: 0 };
  const store: StandingsCacheStore = {
    async read() {
      return state.current;
    },
    async write(_league, rows) {
      state.writes += 1;
      state.current = { rows, fetchedAt: new Date() };
    },
  };
  return { store, state };
}

test("NBA 30팀 정상 응답이면 그대로 반환하고 캐시에 저장한다", async () => {
  const { store, state } = fakeCache();
  const result = await resolveStandingsWithCache("NBA", async () => nbaRows(30), store);

  assert.ok(result);
  assert.equal(result.rows.length, 30);
  assert.equal(result.stale, false);
  assert.equal(state.writes, 1);
});

test("외부 API 가 죽으면 마지막 정상 캐시를 stale 로 반환한다", async () => {
  const fetchedAt = new Date("2026-07-28T00:00:00.000Z");
  const { store, state } = fakeCache({ rows: nbaRows(30), fetchedAt });
  const result = await resolveStandingsWithCache(
    "NBA",
    async () => {
      throw new Error("ESPN 503");
    },
    store,
  );

  assert.ok(result);
  assert.equal(result.rows.length, 30);
  assert.equal(result.stale, true);
  assert.equal(result.updatedAt.toISOString(), fetchedAt.toISOString());
  assert.equal(state.writes, 0, "실패 응답은 캐시를 덮어쓰면 안 된다");
});

test("29개 팀만 오면 부분 응답으로 보고 캐시를 덮어쓰지 않는다", async () => {
  const fetchedAt = new Date("2026-07-28T00:00:00.000Z");
  const { store, state } = fakeCache({ rows: nbaRows(30), fetchedAt });
  const result = await resolveStandingsWithCache("NBA", async () => nbaRows(29), store);

  assert.equal(isCompleteStandings("NBA", nbaRows(29)), false);
  assert.ok(result);
  assert.equal(result.rows.length, 30, "부분 응답 대신 마지막 정상 캐시");
  assert.equal(result.stale, true);
  assert.equal(state.writes, 0);
});

test("외부 실패 + 캐시도 없으면 null — 호출부가 빈 200 대신 503 을 낸다", async () => {
  const { store } = fakeCache();
  const result = await resolveStandingsWithCache("NBA", async () => null, store);
  assert.equal(result, null);
});

test("캐시 저장소가 죽어도 정상 응답은 그대로 나간다", async () => {
  const store: StandingsCacheStore = {
    async read() {
      throw new Error("DB down");
    },
    async write() {
      throw new Error("DB down");
    },
  };
  const result = await resolveStandingsWithCache("NBA", async () => nbaRows(30), store);
  assert.ok(result);
  assert.equal(result.rows.length, 30);
  assert.equal(result.stale, false);
});
