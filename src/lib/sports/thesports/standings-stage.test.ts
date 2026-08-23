// 유럽 대항전 단계 가드 + 그룹 순위 예외 세트 상태 고정.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hideStageStandings, isUnplayedTable } from "./standings-gate";
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

test("남미 대항전 조별리그(6경기)를 마치면 녹아웃 카드에 조 순위를 붙이지 않는다", () => {
  // 2026-08-23 coverage audit 실측: COPA_LIB·COPA_SUD 가 map 에 없어 가드가 아예 안 걸렸고,
  // fresh 캐시가 완료된 조별표(8조×4팀, 전원 6경기)라 8/26·8/27 녹아웃 카드에 조 순위가 붙었다.
  assert.equal(hideStageStandings("COPA_LIB", [played(6), played(6)]), true);
  assert.equal(hideStageStandings("COPA_SUD", [{ won: 3, draw: 1, loss: 2 }]), true);
});

test("남미 대항전도 조별리그 진행 중이면 순위를 유지한다", () => {
  assert.equal(hideStageStandings("COPA_LIB", [played(4), played(3)]), false);
  assert.equal(hideStageStandings("COPA_SUD", [played(5)]), false);
});

test("AFC 챔스 엘리트는 스위스식 8경기 — 6 으로 잡으면 리그페이즈 중에 순위가 사라진다", () => {
  // ts 캐시 실측: AFC_CL 은 2개 지역 테이블×16팀(리그페이즈), 지난 시즌 팀당 8경기.
  // 반면 AFC_CL_TWO 는 8조×4팀이라 6경기 — 같은 AFC 라도 임계가 다르다.
  assert.equal(hideStageStandings("AFC_CL", [played(6), played(6)]), false);
  assert.equal(hideStageStandings("AFC_CL", [played(8), played(7)]), true);
});

test("빈 순위표는 가드 대상이 아니다", () => {
  assert.equal(hideStageStandings("UCL", []), false);
});

test("일반 리그는 이 가드의 영향을 받지 않는다", () => {
  assert.equal(hideStageStandings("EPL", [played(38)]), false);
  assert.equal(hideStageStandings("J1_LEAGUE", [played(20)]), false);
});

test("전 팀 0경기 표는 개막 전 placeholder — 순위 정보가 아니다", () => {
  // 2026-08-23 실측: AFC_CL 32행 전원 0승0무0패인데 12팀이 카드 칩 [1]·[2] 를 받고 있었다.
  assert.equal(isUnplayedTable([played(0), played(0), played(0)]), true);
  assert.equal(isUnplayedTable([{ won: 0, draw: 0, loss: 0 }, {}]), true);
});

test("한 팀이라도 경기를 치렀으면 개막 전이 아니다", () => {
  assert.equal(isUnplayedTable([played(0), played(1), played(0)]), false);
  assert.equal(isUnplayedTable([{ won: 0, draw: 1, loss: 0 }]), false);
  assert.equal(isUnplayedTable([{ won: 0, draw: 0, loss: 1 }]), false);
});

test("빈 표는 0경기가 아니라 표 없음 — 폴백 대상이라 여기서 막지 않는다", () => {
  assert.equal(isUnplayedTable([]), false);
});

test("그룹 순위 예외 세트는 현재 비어 있다 — 2026-27 단일표 복귀", () => {
  // d957798 에서 J1/J2 예외 해제. 세트를 다시 채우면 이 assert 가 깨진다 —
  // 그때는 새 그룹제 대회에 맞는지 관련 규칙을 점검하고 기대값을 갱신하라.
  assert.equal(GROUPED_STANDINGS_LEAGUES.size, 0);
});
