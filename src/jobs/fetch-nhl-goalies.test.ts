// findScheduledGame — 미국 현지 날짜 일정의 서부 경기(UTC 다음날 새벽)도 DB 경기와 짝지어진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findScheduledGame } from "./fetch-nhl-goalies";

const sg = (gamePk: number, startTimeUTC: string, home: string, away: string, ha: string, aa: string) =>
  ({ gamePk, startTimeUTC, homeTeamAbbrev: ha, awayTeamAbbrev: aa, homeTeamName: home, awayTeamName: away });
const schedule = [
  sg(1, "2026-09-30T23:30:00Z", "Toronto Maple Leafs", "New York Islanders", "TOR", "NYI"),
  sg(2, "2026-10-01T02:00:00Z", "Colorado Avalanche", "Los Angeles Kings", "COL", "LAK"),
];

test("UTC 자정을 넘긴 서부 경기도 찾는다 (2026-09-30 콜로라도-LA)", () => {
  const dbm = { startTime: new Date("2026-10-01T02:00:00Z"), homeTeam: { name: "Colorado Avalanche" }, awayTeam: { name: "Los Angeles Kings" } };
  assert.equal(findScheduledGame(dbm, schedule)?.gamePk, 2);
});

test("같은 두 팀이라도 시작 시각이 12시간 넘게 다르면 다른 경기", () => {
  const dbm = { startTime: new Date("2026-10-05T02:00:00Z"), homeTeam: { name: "Colorado Avalanche" }, awayTeam: { name: "Los Angeles Kings" } };
  assert.equal(findScheduledGame(dbm, schedule), undefined);
});
