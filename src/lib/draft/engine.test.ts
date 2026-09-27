// 드래프트 엔진·채점 단위 테스트 — 결정성, 찬스 제한, 공개 규칙, 슬롯 배치, 보너스
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOARD_SIZE, DraftError, boardFinished, isVisible, nextBoard, pick, spy, startGame, applyLifeline, type Pool } from "./engine";
import { assignSlots, isFullLineup, percentileOf, ringsOf, scoreLineup } from "./scoring";
import type { PoolCard, Pos } from "./types";

function card(pid: number, team: string, season: number, pos: Pos[], off = 1, def = 1, dur = 0.5): PoolCard {
  return {
    id: `${pid}-${season}`, pid: String(pid), name: `선수${pid}`, season, team, teamName: team, pos,
    off, def, dur, gp: 50, mpg: 30, pts: 10, reb: 5, ast: 3, stl: 1, blk: 1, photo: null,
  };
}
const POS: Pos[][] = [["G"], ["F"], ["C"], ["G", "F"]];
const pool: Pool = {
  teams: ["A", "B", "C", "D", "E", "F", "G"].map((key) => ({ key, name: key, logo: null, color: "#000" })),
  cards: ["A", "B", "C", "D", "E", "F", "G"].flatMap((t, ti) =>
    Array.from({ length: 40 }, (_, i) => [card(ti * 100 + i, t, 2000, POS[i % 4]), card(ti * 100 + i, t, 2001, POS[i % 4], 2, 0)]).flat(),
  ),
};

test("같은 시드는 같은 판을 만든다", () => {
  const a = startGame(pool, "nba", 42);
  const b = startGame(pool, "nba", 42);
  assert.deepEqual(a, b);
  assert.equal(a.board.cardIds.length, BOARD_SIZE);
  assert.notDeepEqual(startGame(pool, "nba", 43).board.cardIds, a.board.cardIds);
});

test("한 판에 같은 선수가 두 번 나오지 않는다", () => {
  const s = startGame(pool, "nba", 7);
  const pids = s.board.cardIds.map((id) => id.split("-")[0]);
  assert.equal(new Set(pids).size, pids.length);
});

test("5판을 돌면 끝나고 구단이 겹치지 않는다", () => {
  let s = startGame(pool, "nba", 1);
  while (!s.done) {
    s = pick(pool, s, s.board.cardIds[0]);
    s = nextBoard(pool, s);
  }
  assert.equal(s.picks.length, 5);
  assert.equal(new Set(s.usedTeams).size, 5);
  assert.throws(() => pick(pool, s, s.board.cardIds[1]), DraftError);
});

test("픽 전에는 수치가 안 보이고, 픽하면 판 전체가 보인다", () => {
  let s = startGame(pool, "nba", 3);
  const [a, b] = s.board.cardIds;
  assert.equal(isVisible(s, a), false);
  s = spy(s, a);
  assert.equal(isVisible(s, a), true);
  assert.equal(isVisible(s, b), false);
  assert.equal(s.spyLeft, 2);
  s = pick(pool, s, b);
  assert.equal(boardFinished(s), true);
  assert.ok(s.board.cardIds.every((id) => isVisible(s, id)));
  assert.throws(() => pick(pool, s, a), DraftError);
});

test("찬스는 한 번씩만, 픽한 판에서는 못 쓴다", () => {
  let s = startGame(pool, "nba", 5);
  const before = s.board;
  s = applyLifeline(pool, s, "redeal");
  assert.equal(s.board.team, before.team);
  assert.equal(s.board.cardIds.filter((id) => before.cardIds.includes(id)).length, 0);
  assert.throws(() => applyLifeline(pool, s, "redeal"), DraftError);
  s = applyLifeline(pool, s, "swap");
  assert.notEqual(s.board.team, before.team);
  s = applyLifeline(pool, s, "position", "C");
  assert.ok(s.board.cardIds.length > 0);
  assert.ok(s.board.cardIds.every((id) => pool.cards.find((c) => c.id === id)!.pos.includes("C")));
  s = pick(pool, s, s.board.cardIds[0]);
  assert.throws(() => applyLifeline(pool, s, "reveal"), DraftError);
});

test("더블 픽은 한 판에서 두 명, 시즌 섞기는 같은 선수 다른 해", () => {
  let s = startGame(pool, "nba", 9);
  const cast = s.board.cardIds.map((id) => id.split("-")[0]);
  s = applyLifeline(pool, s, "flash");
  assert.deepEqual(s.board.cardIds.map((id) => id.split("-")[0]), cast);
  s = applyLifeline(pool, s, "double");
  s = pick(pool, s, s.board.cardIds[0]);
  assert.equal(boardFinished(s), false);
  s = pick(pool, s, s.board.cardIds[1]);
  assert.equal(boardFinished(s), true);
  s = nextBoard(pool, s);
  assert.equal(s.board.picksAllowed, 1);
});

test("슬롯 배치 — 겸업 선수를 빈자리로 돌린다", () => {
  const l = [card(1, "A", 1, ["G"]), card(2, "A", 1, ["G"]), card(3, "A", 1, ["G", "F"]), card(4, "A", 1, ["F"]), card(5, "A", 1, ["C"])];
  assert.equal(isFullLineup(l), true);
  assert.deepEqual([...assignSlots(l)].sort(), [0, 1, 2, 3, 4]);
  const bad = [...l.slice(0, 4), card(6, "A", 1, ["G"])];
  assert.equal(isFullLineup(bad), false);
  assert.equal(assignSlots(bad).filter((x) => x < 0).length, 1);
});

test("채점 — 보너스 합과 철벽 수비", () => {
  const l = [card(1, "A", 1, ["G"], 2.2, 1.3, 1), card(2, "A", 1, ["G"], 2.2, 1.3, 1), card(3, "A", 1, ["F"], 2.2, 1.3, 1), card(4, "A", 1, ["F"], 2.2, 1.3, 1), card(5, "A", 1, ["C"], 2.2, 1.3, 1)];
  const s = scoreLineup(l, 6);
  assert.equal(s.impact, 17.5);
  assert.equal(s.full, 3);
  assert.equal(s.balance, 2);
  assert.equal(s.durability, 1.5);
  assert.equal(s.lockdown, 4);
  assert.equal(s.total, 28);
  const oneSided = scoreLineup(l.map((c) => ({ ...c, def: -1 })), 6);
  assert.equal(oneSided.balance, -2);
  assert.equal(oneSided.lockdown, 0);
});

test("백분위와 반지", () => {
  const q = Array.from({ length: 101 }, (_, i) => i);
  assert.equal(percentileOf(50.5, q), 50);
  assert.equal(percentileOf(-3, q), 0);
  assert.equal(percentileOf(999, q), 100);
  assert.equal(ringsOf(9), 0);
  assert.equal(ringsOf(13), 1);
  assert.equal(ringsOf(90), 6);
});
