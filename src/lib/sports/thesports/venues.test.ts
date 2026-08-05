// 홈 구장 조회 회귀 테스트 — 이름 폴백의 범위와 가드.
//
// 배경. 같은 구단이 자국 리그 row 와 대륙대회 row 로 갈라져 있어(UCL 예선 등) 대회 row 에는
// tsVenueId 가 없다. 그 탓에 홈 구장 카드도, 구장 도시로 조회하는 날씨 배지도 통째로 빠졌다
// (2026-08-05 스파르타 프라하 vs 리옹 UCL 예선 신고). 구장 데이터 자체는 자국 리그 row 에
// 이미 있으므로 이름으로 한 번 더 찾는다.
//
// 폴백을 대륙대회로 한정하는 이유. 나라가 달라도 이름이 같은 구단이 있다. 자국 리그까지
// 열어주면 벨라루스 Arsenal 이 에미레이츠 스타디움을 가져간다 — 빈 값보다 나쁜 오표시다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getVenueByOurTeamId } from "./venues";

// 매핑에 없는 임의의 Team.id — 폴백 경로만 타게 한다.
const UNMAPPED = 99_000_001;

test("대륙대회에서 id 매핑이 없으면 팀명으로 홈 구장을 찾는다", () => {
  const v = getVenueByOurTeamId(UNMAPPED, "Sparta Praha", "UCL");
  assert.equal(v?.name, "Stadion Letná");
  assert.equal(v?.city, "Prague");
});

test("id 직매핑이 있으면 그대로 쓴다", () => {
  const v = getVenueByOurTeamId(285554, "Sparta Praha", "CZECH_L");
  assert.equal(v?.name, "Stadion Letná");
});

test("자국 리그에는 이름 폴백을 적용하지 않는다 — 동명 구단 오매핑 차단", () => {
  // 벨라루스 Arsenal 이 잉글랜드 아스널 구장을 가져가면 안 된다.
  assert.equal(getVenueByOurTeamId(UNMAPPED, "Arsenal", "BELARUS_PL"), null);
});

test("2군 팀은 1군 구장을 가져가지 않는다", () => {
  assert.equal(getVenueByOurTeamId(UNMAPPED, "Sparta Praha B", "UCL"), null);
});

test("팀명이나 리그가 없으면 폴백하지 않는다", () => {
  assert.equal(getVenueByOurTeamId(UNMAPPED, null, "UCL"), null);
  assert.equal(getVenueByOurTeamId(UNMAPPED, "Sparta Praha", null), null);
  assert.equal(getVenueByOurTeamId(UNMAPPED, "Sparta Praha"), null);
});

test("모르는 팀명은 조용히 null 이다", () => {
  assert.equal(getVenueByOurTeamId(UNMAPPED, "존재하지 않는 팀", "UCL"), null);
});

test("표기 차이(대소문자·발음기호)는 흡수한다", () => {
  const v = getVenueByOurTeamId(UNMAPPED, "sparta  praha", "UCL");
  assert.equal(v?.name, "Stadion Letná");
});
