// 자유게시판 봇이 자사 서비스를 깎아내리는 글을 발행하지 못하는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { disparagesUs } from "./free-board-policy";

test("실제로 발행됐던 자사 조롱 글을 막는다", () => {
  // 2026-07-07~08-18 프로덕션 실측 9건 중 대표 사례
  assert.equal(disparagesUs("AI 1X2 예측 44% ㅋㅋ 인간이 더 낫네 54경기 중 24개 맞췄다는데 그냥 동전 던지는 것도 아니고"), true);
  assert.equal(disparagesUs("65경기 중 33적중이라니... AI도 동전던지기 수준이네 거의 랜덤이랑 다를 바가 없다는 거 아닌가"), true);
  assert.equal(disparagesUs("AI 1X2 예측 53% ㅋㅋ 이게 뭐하는 짓이야 동전 던지는 것보다 나은데 뭐 하는 거냐"), true);
  assert.equal(disparagesUs("AI 모델 43% 적중률이면 뭐하냐 ㄷㄷ 동전 던지는 것과 별 차이 없는데"), true);
  // 사용자가 지적한 8/18 글 — 제목·본문·말미 링크가 합쳐진 실제 발행 형태
  assert.equal(
    disparagesUs(
      "AI 모델 128경기 중 71적중 55%ㅋㅋ 이게 뭐하는 거야 " +
        "동전던지기랑 뭐가 다르냐고 ㅋㅋ 차라리 무작위가 낫겠는데? 광고 그만하고 업그레이드 먼저 " +
        "[리그별 적중률 보기](/predictions/accuracy)",
    ),
    true,
  );
});

test("주어를 생략해도 적중률 링크가 붙으면 자사 얘기로 잡는다", () => {
  // 본문에 AI·모델 같은 말이 없어도 ai-report 토픽은 늘 이 링크가 붙는다
  assert.equal(
    disparagesUs("128경기 55% 라니 차라리 무작위가 낫겠다 [리그별 적중률 보기](/predictions/accuracy)"),
    true,
  );
});

test("경기 결과에 놀라는 정상 글은 막지 않는다", () => {
  // 같은 봇이 쓴 정상 글 — "뭐하는 팀이냐"는 팀을 향한 감탄이지 자사 비하가 아니다
  assert.equal(disparagesUs("30% 확률로 이겼다고? 래피드 진짜 뭐하는 팀이냐 ㄷㄷ 파이데를 4:1로 터트렸는데"), false);
  assert.equal(disparagesUs("DRX 34% 확률로 이겼네 ㄷㄷ KT전에서 4분의 1 확률로 예측되던 경기인데 진짜 이겼다"), false);
});

test("예측이 빗나간 것을 향해 '뭐하는 짓' 이라고 하면 약한 비하라 막는다", () => {
  // post#1253 실측 — 팀이 아니라 우리 예측을 겨냥한 문장이라 차단이 맞다
  assert.equal(
    disparagesUs("DRX 34% 확률로 이겼네 ㄷㄷ 4분의 1 확률로 예측되던 경기인데 진짜 이겼다. 이게 뭐하는 짓이냐 ㅋㅋ"),
    true,
  );
});

test("담백한 AI 성적 언급은 통과시킨다", () => {
  assert.equal(disparagesUs("어제 AI 예측 55% 나왔네. 30일 누계는 58% 라니까 하루는 표본이 작긴 하다"), false);
  assert.equal(disparagesUs("AI 적중률 67% ㄷㄷ 이 정도면 참고할 만한데"), false);
});

test("우리 얘기가 아니면 비하 표현이 있어도 통과시킨다", () => {
  // 게이트는 '우리를 가리키는 말 + 비하'가 함께일 때만 작동한다
  assert.equal(disparagesUs("오늘 심판 판정 진짜 형편없네"), false);
  assert.equal(disparagesUs("저 팀 불펜은 차라리 안 쓰는 게 낫겠다"), false);
});
