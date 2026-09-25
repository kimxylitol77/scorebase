// 몬테카를로 추가 순위 구간(topCutoffs → topN) — 남은 경기 없이 순위가 정해진 경우로 고정.
import test from "node:test";
import assert from "node:assert/strict";
import { runMonteCarlo } from "./monte-carlo";
import type { PredictMatch } from "./types";

const fin = (id: number, h: number, a: number, hs: number, as: number): PredictMatch => ({
  id, league: "UCL", status: "FINISHED", homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, startTime: new Date("2026-09-10T19:00:00Z"),
});

test("topCutoffs 로 요청한 N위 이내 확률이 행에 실린다", () => {
  // 1 > 2 > 3 순서가 확정된 상태(1은 2승, 2는 1승, 3은 무승)
  const ms = [fin(1, 1, 2, 2, 0), fin(2, 1, 3, 1, 0), fin(3, 2, 3, 3, 1)];
  const rows = runMonteCarlo(ms, "UCL", { iterations: 50, topCutoffs: [1, 2] });
  const by = new Map(rows.map((r) => [r.teamId, r]));
  assert.equal(by.get(1)!.topN![1], 0.999); // 확정이어도 0.999 캡
  assert.equal(by.get(2)!.topN![1], 0);
  assert.equal(by.get(2)!.topN![2], 0.999);
  assert.equal(by.get(3)!.topN![2], 0);
});

test("topCutoffs 를 안 주면 topN 이 없다(기존 호출부 영향 없음)", () => {
  const rows = runMonteCarlo([fin(1, 1, 2, 1, 0)], "UCL", { iterations: 5 });
  assert.equal(rows[0].topN, undefined);
});
