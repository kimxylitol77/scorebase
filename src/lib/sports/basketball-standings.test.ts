import assert from "node:assert/strict";
import test from "node:test";
import { parseEspnNbaStandings } from "./basketball-standings";

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
