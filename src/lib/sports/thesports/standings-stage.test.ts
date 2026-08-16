// 유럽 대항전 단계 가드 + 그룹 순위 예외 세트 상태 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hideStageStandings } from "./standings-gate";
import { GROUPED_STANDINGS_LEAGUES } from "./standings-helper";

const played = (n: number) => ({ won: n, draw: 0, loss: 0 });

test("리그페이즈 진행 중에는 UCL 순위를 계속 보여준다", () => {
  assert.equal(hideStageStandings("UCL", [played(3), played(4), played(2)]), false);
});

test("리그페이즈를 마치면(8경기) 이후 단계에 이전 순위를 붙이지 않는다", () => {
  // 녹아웃 매치
  assert.equal(hideStageStandings("UCL", [played(8), played(5)]), true);
  // 예선 라운드 — 직전 시즌 리그페이즈 표(8경기 소화)가 남아 있어도 표기하지 않는다
  assert.equal(hideStageStandings("UEL", [{ won: 4, draw: 2, loss: 2 }]), true);
  assert.equal(hideStageStandings("UECL", [played(8)]), true);
});

test("리그페이즈가 6경기인 대회는 6경기로 판정한다 — 8 로 고정하면 가드가 영원히 안 걸린다", () => {
  // 2026-08-20 UECL 플레이오프에 작년 리그페이즈 순위가 붙던 결함
  assert.equal(hideStageStandings("UECL", [played(6), played(6)]), true);
  assert.equal(hideStageStandings("AFC_CL_TWO", [played(6)]), true);
  assert.equal(hideStageStandings("UEFA_WCL", [{ won: 3, draw: 1, loss: 2 }]), true);
});

test("6경기 대회도 리그페이즈 진행 중이면 순위를 유지한다", () => {
  assert.equal(hideStageStandings("UECL", [played(3), played(2)]), false);
  assert.equal(hideStageStandings("AFC_CL_TWO", [played(3)]), false);
  assert.equal(hideStageStandings("UEFA_WCL", [played(5)]), false);
});

test("빈 순위표는 가드 대상이 아니다", () => {
  assert.equal(hideStageStandings("UCL", []), false);
});

test("일반 리그는 이 가드의 영향을 받지 않는다", () => {
  assert.equal(hideStageStandings("EPL", [played(38)]), false);
  assert.equal(hideStageStandings("J1_LEAGUE", [played(20)]), false);
});

test("그룹 순위 예외 세트는 현재 비어 있다 — 2026-27 단일표 복귀", () => {
  // d957798 에서 J1/J2 예외 해제. 세트를 다시 채우면 이 assert 가 깨진다 —
  // 그때는 새 그룹제 대회에 맞는지 관련 규칙을 점검하고 기대값을 갱신하라.
  assert.equal(GROUPED_STANDINGS_LEAGUES.size, 0);
});
