// toPlayerBox — KBL 공식 player-stat 한 행을 박스스코어 행으로(야투 = fgt, 2점 fg 아님).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlayerBox } from "./kbl-game";

test("허일영 2025-26 개막전 행", () => {
  const b = toPlayerBox({
    player: { pcode: "290284", pname: "허일영", tcode: "50", pos: "FD" },
    records: { playMin: 22, playSec: 34, score: 6, rb: 5, offr: 1, ast: 0, stl: 1, bs: 1, to: 0, fgt: 2, fgtA: 8, threep: 0, threepA: 4, ft: 2, ftA: 2, foul: 4 },
  });
  assert.equal(b.min, "22:34");
  assert.deepEqual([b.points, b.reb, b.fgm, b.fga, b.tpm, b.tpa, b.ftm, b.fta], [6, 5, 2, 8, 0, 4, 2, 2]);
  assert.equal(b.pos, "F");
});
