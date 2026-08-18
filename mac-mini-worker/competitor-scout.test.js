const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dedupeReportCandidates,
  extractCandidates,
  extractReferenceCandidates,
  validateReport,
} = require("./competitor-scout");

const duplicateReport = `🛰 신규 발굴 결과

🥊 직접 경쟁자
1. NewMatch | newmatch.test | 팬용 경기 분석 서비스
- 근거: https://newmatch.test/product
- 제품 유형: 소비자용 경기 분석
- 실제 경기 대상: 예
- 직접 겹침: AI 예측, 경기 데이터
- 차이: 경기별 분석을 한 화면에서 제공한다.

🧭 아이디어 참고 서비스
1. NewMatch Labs | www.newmatch.test | 같은 제품의 참고 기능
- 근거: https://newmatch.test/labs
- 참고 이유: 팬 참여형 비교 화면을 참고할 수 있다.

💡 Scorebase 아이디어
1. 경기별 예측 근거를 한 화면에 묶어 비교한다 [근거: newmatch.test] [난이도 하·효과 상]
2. 사용자 선택과 모델 선택을 경기 후 자동으로 채점한다 [근거: newmatch.test] [난이도 중·효과 상]

🎯 오늘 1순위
- 예측 근거 비교 화면을 먼저 실험한다.`;

test("직접 경쟁자와 참고 서비스의 동일 도메인은 직접 경쟁자만 남긴다", () => {
  const deduped = dedupeReportCandidates(duplicateReport);

  assert.deepEqual(deduped.removed, ["newmatch.test"]);
  assert.deepEqual(extractCandidates(deduped.report), [
    { name: "NewMatch", domain: "newmatch.test" },
  ]);
  assert.deepEqual(extractReferenceCandidates(deduped.report), []);
  assert.match(deduped.report, /검증 가능한 참고 서비스 없음/);
  assert.doesNotThrow(() => validateReport(deduped.report, { discoveries: [] }));
});

// ── 자가치유(후보 단위 강등) — 검증 실패 후보만 떼어내고 나머지 보고를 살린다 ──

const { buildPrompt, removeCandidatesFromReport } = require("./competitor-scout");

const mixedReport = `🛰 신규 발굴 결과

🥊 직접 경쟁자
1. GoodOne | goodone.test | 팬용 AI 경기 예측 서비스
- 근거: https://goodone.test/product
- 제품 유형: 소비자용 AI 예측
- 실제 경기 대상: 예
- 직접 겹침: AI 예측, 경기 데이터
- 차이: 경기별 확률 근거를 공개한다.
2. BadOne | badone.test | 실제 경기 여부가 불확실한 서비스
- 근거: https://badone.test/product
- 제품 유형: 소비자용 AI 예측
- 실제 경기 대상: 확인 불가
- 직접 겹침: AI 예측, 경기 데이터
- 차이: 설명이 모호하다.

🧭 아이디어 참고 서비스
- 검증 가능한 참고 서비스 없음

💡 Scorebase 아이디어
1. 예측 확률의 근거 스탯을 카드로 노출한다 [근거: goodone.test] [난이도 중·효과 상]
2. 경기 후 자동 채점 배지를 붙인다 [근거: goodone.test] [난이도 하·효과 중]
3. 불확실한 기능을 흉내낸다 [근거: badone.test] [난이도 상·효과 하]

🎯 오늘 1순위
- 근거 스탯 카드부터 실험한다.`;

test("검증 실패 오류에는 문제 후보 도메인이 실려 온다", () => {
  try {
    validateReport(mixedReport, { discoveries: [] });
    assert.fail("실제 경기 대상 미확인 후보가 통과하면 안 된다");
  } catch (error) {
    assert.match(error.message, /실제 경기 대상 확인 실패: badone\.test/);
    assert.deepEqual(error.domains, ["badone.test"]);
  }
});

test("문제 후보만 제거하면 나머지 보고는 검증을 통과한다", () => {
  const salvaged = removeCandidatesFromReport(mixedReport, ["badone.test"]);
  const result = validateReport(salvaged, { discoveries: [] });
  assert.deepEqual(result.direct, [{ name: "GoodOne", domain: "goodone.test" }]);
  // 떨어진 후보를 근거로 쓴 아이디어 줄도 함께 사라지고 번호가 다시 매겨진다
  assert.ok(!salvaged.includes("badone.test"));
  assert.match(salvaged, /2\. 경기 후 자동 채점 배지/);
});

test("탈락 기록이 있는 도메인이 재등장하면 도메인이 실린 오류가 난다", () => {
  const clean = removeCandidatesFromReport(mixedReport, ["badone.test"]);
  try {
    validateReport(clean, {
      discoveries: [],
      rejected: [{ domain: "goodone.test", reason: "과거 탈락", date: "2026-08-18" }],
    });
    assert.fail("탈락 기록 도메인이 통과하면 안 된다");
  } catch (error) {
    assert.match(error.message, /기존·제외 도메인 재등장: goodone\.test/);
    assert.deepEqual(error.domains, ["goodone.test"]);
  }
});

test("buildPrompt 는 상태 파일의 탈락 도메인을 금지 목록에 합친다", () => {
  const prompt = buildPrompt([], ["sportspredict.com"]);
  const rejectedSection = prompt
    .split("## 제품 유형 오분류로 탈락한 도메인 — 후보·참고 서비스 모두 금지")[1]
    .split("##")[0];
  assert.match(rejectedSection, /sportspredict\.com/);
  assert.match(rejectedSection, /zed\.run/); // 기존 정적 목록도 유지
});
