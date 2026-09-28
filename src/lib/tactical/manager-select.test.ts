// 이달의 감독 선정 점수 단위 테스트 — 성적 우선, 같은 성적이면 기대 대비 초과 성과, 예측 결손 허용
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectionTable, type SelectMatch } from "./manager-select";

const m = (h: number, a: number, hs: number, as: number, p: [number, number, number] | null): SelectMatch => ({
  homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as,
  predHome: p?.[0] ?? null, predDraw: p?.[1] ?? null, predAway: p?.[2] ?? null,
});

test("같은 전승이면 약체로 평가받던 팀이 위", () => {
  // 1번은 강팀(승률 70% 예측), 2번은 약팀(승률 20% 예측). 둘 다 이겼다.
  const t = selectionTable([m(1, 3, 2, 0, [0.7, 0.2, 0.1]), m(2, 4, 1, 0, [0.2, 0.3, 0.5])]);
  assert.equal(t[0].teamId, 2);
  assert.equal(t[0].ppg, 3);
  assert.ok(t[0].over > t.find((r) => r.teamId === 1)!.over);
});

test("초과 성과가 커도 성적이 크게 낮으면 못 뒤집는다", () => {
  // 1번 2전 전승(예측도 우세), 2번 1승 1패(약체 예측).
  const t = selectionTable([
    m(1, 3, 1, 0, [0.7, 0.2, 0.1]), m(1, 4, 2, 0, [0.7, 0.2, 0.1]),
    m(2, 5, 1, 0, [0.1, 0.2, 0.7]), m(2, 6, 0, 1, [0.1, 0.2, 0.7]),
  ]);
  assert.equal(t[0].teamId, 1);
});

test("기대 승점은 확률 합으로 정규화한다", () => {
  // 합이 100 인 퍼센트 값이 와도 같은 결과
  const a = selectionTable([m(1, 2, 1, 1, [0.5, 0.3, 0.2])]).find((r) => r.teamId === 1)!;
  const b = selectionTable([m(1, 2, 1, 1, [50, 30, 20])]).find((r) => r.teamId === 1)!;
  assert.ok(Math.abs(a.expectedPpg! - 1.8) < 1e-9);
  assert.ok(Math.abs(b.expectedPpg! - 1.8) < 1e-9);
});

test("예측이 없는 경기만 있으면 초과 성과 0 으로 성적만 본다", () => {
  const r = selectionTable([m(1, 2, 3, 1, null)]).find((x) => x.teamId === 1)!;
  assert.equal(r.expectedPpg, null);
  assert.equal(r.over, 0);
  assert.ok(Math.abs(r.score - (3 + 2 / 100)) < 1e-9);
});
