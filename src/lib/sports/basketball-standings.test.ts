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

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
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
  assert.equal(rows[1].group, "서부 컨퍼런스");
  assert.equal(rows[1].position, 1);
  assert.equal(rows[1].gamesBehind, 0);
});
