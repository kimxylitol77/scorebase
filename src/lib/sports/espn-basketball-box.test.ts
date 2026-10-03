// ESPN summary boxscore.players → 선수 박스 (2026-10-03 WNBA 플레이오프 댈러스@골든스테이트 401918294 행 형식)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEspnBasketballPlayers } from "./live-scores";

const names = ["MIN", "PTS", "FG", "3PT", "FT", "REB", "AST", "TO", "STL", "BLK", "OREB", "DREB", "PF", "+/-"];

test("선발·벤치·미출전 순서, 슛 성공-시도, +/- 부호, 미출전은 +/- 없음", () => {
  const rows = parseEspnBasketballPlayers({
    team: { id: "3" },
    statistics: [{
      names,
      athletes: [
        { athlete: { id: "1", displayName: "Bench Guy" }, starter: false, stats: ["20", "15", "6-10", "1-3", "2-2", "4", "1", "0", "1", "0", "1", "3", "2", "+5"] },
        { athlete: { id: "2", displayName: "Jessica Shepard", position: { abbreviation: "F" } }, starter: true, stats: ["40", "12", "6-11", "0-1", "0-1", "12", "2", "1", "0", "0", "2", "10", "2", "-3"] },
        { athlete: { id: "3", displayName: "Li Yueru" }, starter: false, didNotPlay: true, stats: [] },
      ],
    }],
  });
  assert.deepEqual(rows.map((r) => [r.pid, r.starter, r.dnp]), [["2", true, false], ["1", false, false], ["3", false, true]]);
  const s = rows[0];
  assert.deepEqual([s.min, s.points, s.reb, s.fgm, s.fga, s.tpm, s.tpa, s.to, s.pf, s.plusMinus, s.pos], ["40", 12, 12, 6, 11, 0, 1, 1, 2, -3, "F"]);
  assert.equal(rows[1].plusMinus, 5);
  assert.equal(rows[2].plusMinus, null);
});
