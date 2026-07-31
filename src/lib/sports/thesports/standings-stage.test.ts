// 유럽 대항전 단계 가드 + J1/J2 그룹 순위 예외 보존.
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

test("빈 순위표는 가드 대상이 아니다", () => {
  assert.equal(hideStageStandings("UCL", []), false);
});

test("일반 리그는 이 가드의 영향을 받지 않는다", () => {
  assert.equal(hideStageStandings("EPL", [played(38)]), false);
  assert.equal(hideStageStandings("J1_LEAGUE", [played(20)]), false);
});

test("J1/J2 그룹 순위 예외는 그대로 유지된다", () => {
  assert.ok(GROUPED_STANDINGS_LEAGUES.has("J1_LEAGUE"));
  assert.ok(GROUPED_STANDINGS_LEAGUES.has("J2_LEAGUE"));
  assert.equal(GROUPED_STANDINGS_LEAGUES.size, 2);
});
