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

import { readFileSync } from "node:fs";
import { decodeKblPlays } from "./kbl-game";

test("문자중계 해독 — 2025-26 개막전(LG 홈 81-89 SK, 연장) 누적 스코어·선발·문구", () => {
  const rows = JSON.parse(readFileSync(new URL("./__fixtures__/kbl-textcast-S47G01N1.json", import.meta.url), "utf8"));
  const r = decodeKblPlays(rows, "50");
  const last = r.plays[r.plays.length - 1];
  assert.deepEqual([last.homeScore, last.awayScore], [81, 89]);
  assert.deepEqual(r.starters.home, ["칼 타마요", "유기상", "양준석", "정인덕", "아셈 마레이"]);
  assert.equal(r.starters.away.length, 5);
  const first3 = r.plays.find((p) => p.text === "3점슛 성공")!;
  assert.deepEqual([first3.player, first3.period, first3.clock, first3.homeScore], ["칼 타마요", "1Q", "9:46", 3]);
  assert.ok(r.plays.some((p) => p.period === "OT1"));
  assert.ok(r.plays.some((p) => p.text.includes("5반칙 퇴장")));
});
