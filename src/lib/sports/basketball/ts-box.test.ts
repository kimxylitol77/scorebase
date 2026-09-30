// parseTsBoxPlayer — ts 박스스코어 문자열 필드 순서(실측 2026-09-20 일본-한국) 검산.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTsBoxPlayer } from "./ts-box";

test("오가와 아츠야 행 — 득점 = 야투×2 + 3점 + 자유투", () => {
  const p = parseTsBoxPlayer(["dn1m17t3l77moep", "Atsuya Ogawa", "https://img/x.png", "31", "24^5-11^2-4^0-2^1^4^5^2^0^0^5^2^-19^12^1^0^0"])!;
  assert.equal(p.min, 24);
  assert.deepEqual([p.fgm, p.fga, p.tpm, p.tpa, p.ftm, p.fta], [5, 11, 2, 4, 0, 2]);
  assert.deepEqual([p.reb, p.ast, p.stl, p.blk, p.tov, p.pts], [5, 2, 0, 0, 5, 12]);
  assert.equal(p.fgm * 2 + p.tpm + p.ftm, p.pts);
});

test("모양이 다른 행은 null", () => {
  assert.equal(parseTsBoxPlayer("0^22-73^8-29"), null);
  assert.equal(parseTsBoxPlayer(["id", "name"]), null);
});
