// 플레이오프 확률 엔진 — 형식별 불변식: 우승 합 1, 단계 확률 단조 감소, 진출 팀 수·라운드 팀 수 합이 규정과 같다.
import test from "node:test";
import assert from "node:assert/strict";
import { runPlayoffSim, STAGES, type PlayoffFormat, type SimTeam } from "./engine";

function league(format: PlayoffFormat, groups: Array<{ g: string; n: number; divs?: number }>) {
  const teams: SimTeam[] = [];
  let id = 1;
  for (const { g, n, divs } of groups) {
    for (let i = 0; i < n; i++) teams.push({ id: id++, group: g, division: divs ? `${g}-${i % divs}` : undefined, w: 10, l: 10, d: 0, otl: 0 });
  }
  const games = [];
  for (const a of teams) for (const b of teams) if (a.id < b.id && a.group === b.group) games.push({ home: a.id, away: b.id });
  const elo = (id: number) => 1500 + id * 5;
  const prob = (h: number, a: number) => {
    const p = 1 / (1 + Math.pow(10, (elo(a) - elo(h) - 30) / 400));
    return { home: p * 0.97, draw: 0.03, away: (1 - p) * 0.97 };
  };
  return runPlayoffSim(format, teams, games, prob, 400);
}

const cases: Array<[PlayoffFormat, Array<{ g: string; n: number; divs?: number }>, number[]]> = [
  // 단계별 도달 팀 수 기대값 (진출, …, 우승=1)
  ["KBO", [{ g: "ALL", n: 10 }], [5, 4, 3, 2, 1]],
  ["NPB", [{ g: "C", n: 6 }, { g: "P", n: 6 }], [6, 4, 2, 1]],
  ["NHL", [{ g: "E", n: 16, divs: 2 }, { g: "W", n: 16, divs: 2 }], [16, 8, 4, 2, 1]],
  ["NBA", [{ g: "E", n: 15 }, { g: "W", n: 15 }], [16, 8, 4, 2, 1]],
  ["KHL", [{ g: "E", n: 11 }, { g: "W", n: 11 }], [16, 8, 4, 2, 1]],
  ["MLS", [{ g: "E", n: 15 }, { g: "W", n: 15 }], [18, 8, 4, 2, 1]],
  ["KBL", [{ g: "ALL", n: 10 }], [6, 4, 2, 1]],
];

for (const [format, groups, expected] of cases) {
  test(`${format} — 단계별 팀 수 합·단조 감소`, () => {
    const odds = league(format, groups);
    assert.equal(expected.length, STAGES[format].length);
    expected.forEach((n, k) => {
      const sum = odds.reduce((s, o) => s + o.stage[k], 0);
      assert.ok(Math.abs(sum - n) < 1e-9, `${format} stage ${k} sum ${sum} != ${n}`);
    });
    for (const o of odds) for (let k = 1; k < o.stage.length; k++) assert.ok(o.stage[k] <= o.stage[k - 1] + 1e-12);
  });
}

test("KBO 실제 포스트시즌 반영 — 2025 대진: WC 삼성(4위) 1승1패+어드밴티지 통과, 준PO 삼성 3승1패", () => {
  // 1 LG · 2 한화 · 3 SSG · 4 삼성 · 5 NC
  const [LG, HH, SSG, SS, NC] = [1, 2, 3, 4, 5];
  const teams: SimTeam[] = [LG, HH, SSG, SS, NC, 6, 7, 8, 9, 10].map((id) => ({ id, group: "ALL", w: 0, l: 0, d: 0, otl: 0 }));
  const pairs = new Map<string, [number, number]>([
    [`${SS}-${NC}`, [1, 1]], // lo=SS(4) 1승, NC 1승
    [`${SSG}-${SS}`, [1, 3]], // SSG 1승, 삼성 3승
  ]);
  const known = (a: number, b: number): [number, number] | null => {
    const w = pairs.get(`${Math.min(a, b)}-${Math.max(a, b)}`);
    return w ? (a < b ? w : [w[1], w[0]]) : null;
  };
  const prob = () => ({ home: 0.5, draw: 0, away: 0.5 });
  const odds = runPlayoffSim("KBO", teams, [], prob, 500, Math.random, {
    fixedRank: new Map([["ALL", [LG, HH, SSG, SS, NC, 6, 7, 8, 9, 10]]]),
    known,
  });
  const o = (id: number) => odds.find((x) => x.teamId === id)!.stage;
  assert.equal(o(NC)[1], 0); // 준PO 못 감
  assert.equal(o(SS)[1], 1); // 준PO 진출
  assert.equal(o(SSG)[2], 0); // PO 못 감
  assert.equal(o(SS)[2], 1); // PO 진출
  assert.equal(o(6)[0], 0); // 6위는 가을야구 0
  assert.ok(Math.abs(odds.reduce((s, x) => s + x.stage[4], 0) - 1) < 1e-9);
  assert.ok(o(LG)[3] === 1 && o(LG)[4] > 0.4); // 1위는 KS 직행, 우승 확률은 PO 승자보다 높다(동전 확률이라 대략 0.5)
});
