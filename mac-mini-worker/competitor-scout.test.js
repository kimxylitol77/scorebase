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
