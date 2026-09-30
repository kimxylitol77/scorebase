// buildKnockout — 8강부터 결승·3·4위전, 순위 결정전 분리, 진행 중 라운드 이름, 메달전만 있는 야구형.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKnockout, type KoMatch } from "./asian-games-knockout";

let t = 0;
const m = (homeId: number, awayId: number, hs: number | null, as: number | null): KoMatch =>
  ({ id: ++t, startTime: t, homeId, awayId, homeScore: hs, awayScore: as, finished: hs != null });

test("8강 → 4강 → 3·4위전·순위전 → 결승", () => {
  const ko = [
    m(1, 8, 80, 60), m(2, 7, 80, 60), m(3, 6, 80, 60), m(4, 5, 80, 60),
    m(8, 7, 70, 60), // 5~8위 순위전 — 8강 패자끼리
    m(1, 4, 70, 60), m(2, 3, 50, 60),
    m(4, 2, 77, 70), // 3·4위전
    m(1, 3, 90, 88),
  ];
  const r = buildKnockout(ko, null, { forward: true });
  assert.deepEqual(r.rounds.map((x) => [x.label, x.matches.length]), [["8강", 4], ["4강", 2], ["결승", 1]]);
  assert.equal(r.bronze?.homeId, 4);
  assert.deepEqual(r.podium, [1, 3, 4, 2]);
});

test("진행 중(4강 전)이면 라운드 이름은 유지, 메달은 비운다", () => {
  const ko = [m(1, 8, 80, 60), m(2, 7, 80, 60), m(3, 6, 80, 60), m(4, 5, 80, 60), m(1, 4, null, null), m(2, 3, null, null)];
  const r = buildKnockout(ko, null, { forward: true });
  assert.deepEqual(r.rounds.map((x) => x.label), ["8강", "4강"]);
  assert.deepEqual(r.podium, [null, null, null, null]);
});

test("메달전 두 경기뿐이면 2라운드 1·2위 맞대결이 결승", () => {
  const ko = [m(3, 4, 5, 2), m(1, 2, 3, 4)];
  const r = buildKnockout(ko, [1, 2]);
  assert.deepEqual(r.rounds.map((x) => x.label), ["결승"]);
  assert.deepEqual(r.podium, [2, 1, 3, 4]);
});

const day = (d: number, h: number) => Date.UTC(2026, 8, d, h);
const md = (d: number, h: number, homeId: number, awayId: number, hs: number, as: number): KoMatch =>
  ({ id: ++t, startTime: day(d, h), homeId, awayId, homeScore: hs, awayScore: as, finished: true });

test("끝난 대회 — 첫 라운드에 순위결정전이 섞여도 결승에서 거꾸로 8강·4강을 가린다 (2026 배구 여자 축소)", () => {
  const ko = [
    md(20, 1, 1, 8, 3, 0), md(20, 2, 20, 21, 3, 0), md(20, 3, 2, 7, 3, 0), md(20, 4, 3, 6, 3, 0), md(20, 5, 4, 5, 3, 0), md(20, 6, 22, 23, 3, 0),
    md(21, 1, 1, 4, 3, 0), md(21, 2, 2, 3, 3, 2), md(21, 3, 8, 7, 3, 0), md(21, 4, 20, 22, 3, 0),
    md(22, 1, 4, 3, 3, 1), md(22, 3, 1, 2, 0, 3), md(22, 0, 21, 23, 3, 0),
  ];
  const r = buildKnockout(ko, null, { complete: true });
  assert.deepEqual(r.rounds.map((x) => [x.label, x.matches.length]), [["8강", 4], ["4강", 2], ["결승", 1]]);
  assert.deepEqual(r.podium, [2, 1, 4, 3]);
});

test("진행 중이고 앞으로 세기가 허용 안 된 대회는 비운다", () => {
  const r = buildKnockout([m(1, 2, null, null)], null, {});
  assert.deepEqual(r.rounds, []);
});
