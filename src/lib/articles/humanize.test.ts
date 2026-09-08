// 심판봇 테스트 — 채점기가 AI 티를 구분하는지, 불변 검증이 사실 훼손을 잡는지, 루프가 검증 실패 시 원문을 지키는지 (LLM 호출 없음).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvariants, humanizeArticle, isProtectedLine, restoreProtectedLines, scoreHumanness } from "./humanize";

// 우리 프리뷰의 전형 — 균일한 문장 길이, "이는 ~을 보여준다" 마무리, 강조어, 볼드 라벨 세트.
const ROBOTIC = `# 양키스의 선발 우위가 좌우하는 매치 — 분기점

**리드 문장이다.**

## 매치업 분석

**리그 순위와 전력 격차**

뉴욕양키스는 Elo 레이팅 1566으로 리그 최상위권 팀임을 입증하고 있다. 반면 콜로라도의 Elo 1411은 155점 격차를 명확히 드러낸다. 이는 단순한 순위 차이를 넘어 팀의 기본 전력에서 명확한 위계를 보여준다.

**선발 투수 대결의 중요성**

워렌의 ERA 4.16은 스가노의 ERA 5.19와 1.03의 극명한 차이를 기록하고 있다. FIP 기준으로도 워렌이 1.14 우위에 있어 명확한 격차를 드러낸다. 이는 선발 투수 개인 능력에서 양키스가 한 등급 위임을 보여준다.

**공수 지표의 극단적 차이**

양키스는 수비 1위로 경기당 실점 최소화에서 리그 최고 수준임을 의미한다. 콜로라도는 수비 30위로 극악의 수비 능력을 드러낸다. 이는 콜로라도의 수비 취약성이 얼마나 심각한지를 단적으로 보여준다.

**홈/원정 강도의 극명한 대조**

양키스는 홈에서 66승 47패로 압도적인 홈 강도를 기록했다. 콜로라도는 원정에서 38승 74패로 극단적인 약세를 드러낸다. 이는 콜로라도의 원정 전력이 얼마나 취약한지를 극명하게 보여준다.

**🎯 예측 신뢰도: 높음** — 최고확률 양키스 61%

## 관전 포인트

1. 첫 번째 포인트다.
2. 두 번째 포인트다.
3. 세 번째 포인트다.

**본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다.**`;

// 같은 사실을 사람 호흡으로 — 문장 길이 변주, 해설 마무리 없음, 강조어 없음.
const HUMAN = `# 양키스의 선발 우위가 좌우하는 매치 — 분기점

**리드 문장이다.**

## 매치업 분석

양키스의 Elo는 1566이다. 콜로라도는 1411. 155점 차이인데, 이 정도면 순위표의 위아래가 아니라 체급이 다르다고 봐야 한다. 선발도 마찬가지다. 워렌은 ERA 4.16, 스가노는 5.19로 1.03 차이가 나고 FIP로 봐도 워렌이 1.14 앞선다. 수비는 더 벌어진다. 양키스가 리그 1위, 콜로라도가 30위다.

홈과 원정을 겹쳐 보면 그림이 선명해진다. 양키스는 홈에서 66승 47패. 콜로라도는 원정에서 38승 74패를 기록했는데, 원정에서 이렇게 무너지는 팀이 양키 스타디움에서 갑자기 달라질 이유를 찾기 어렵다. 다만 야구는 하루 경기다. 선발 하나가 흔들리면 숫자는 금방 뒤집힌다.

**🎯 예측 신뢰도: 높음** — 최고확률 양키스 61%

## 관전 포인트

1. 첫 번째 포인트다.
2. 두 번째 포인트다.
3. 세 번째 포인트다.

**본 분석은 통계 모델 기반 참고용이며, 베팅 권유가 아닙니다.**`;

test("보존 줄 판별 — 헤딩·표·라벨·주석·면책", () => {
  assert.equal(isProtectedLine("## 매치업 분석"), true);
  assert.equal(isProtectedLine("| 시장 | 모델 |"), true);
  assert.equal(isProtectedLine("**🎯 예측 신뢰도: 높음** — 최고확률 61%"), true);
  assert.equal(isProtectedLine("<!-- mvp:123 -->"), true);
  assert.equal(isProtectedLine("**본 분석은 참고용입니다.**"), true);
  assert.equal(isProtectedLine("**리그 순위와 전력 격차**"), false);
  assert.equal(isProtectedLine("보통 문장이다."), false);
});

test("채점기 — 기계 글은 낮고 사람 글은 높다", () => {
  const r = scoreHumanness(ROBOTIC);
  const h = scoreHumanness(HUMAN);
  assert.ok(r.score < 60, `robotic=${r.score} ${JSON.stringify(r.metrics)}`);
  assert.ok(h.score >= 80, `human=${h.score} ${JSON.stringify(h.metrics)}`);
  assert.ok(r.findings.some((f) => /보여준다/.test(f)), "해설 마무리를 잡아야 한다");
  assert.ok(r.findings.some((f) => /강조어/.test(f)), "강조어를 잡아야 한다");
  assert.ok(r.findings.some((f) => /볼드 소제목/.test(f)), "볼드 라벨 세트를 잡아야 한다");
});

test("채점은 결정론 — 같은 글 같은 점수", () => {
  assert.equal(scoreHumanness(ROBOTIC).score, scoreHumanness(ROBOTIC).score);
});

test("불변 검증 — 숫자가 빠지거나 생기면 폐기, 헤딩·라벨 바뀌면 폐기, 문체만 바뀌면 통과", () => {
  assert.deepEqual(checkInvariants(ROBOTIC, HUMAN), []);
  const dropped = HUMAN.replace("FIP로 봐도 워렌이 1.14 앞선다.", "FIP로 봐도 워렌이 앞선다.");
  assert.ok(checkInvariants(ROBOTIC, dropped).some((r) => r.includes("숫자 누락")));
  const invented = HUMAN.replace("체급이 다르다", "체급이 다르다. 최근 10경기 승률 70%다");
  assert.ok(checkInvariants(ROBOTIC, invented).some((r) => r.includes("새 숫자")));
  const heading = HUMAN.replace("## 매치업 분석", "## 매치업");
  assert.ok(checkInvariants(ROBOTIC, heading).some((r) => r.includes("보존 줄")));
  const label = HUMAN.replace("**🎯 예측 신뢰도: 높음** — 최고확률 양키스 61%", "**🎯 예측 신뢰도: 보통** — 최고확률 양키스 61%");
  assert.ok(checkInvariants(ROBOTIC, label).some((r) => r.includes("보존 줄")));
});

test("루프 — 검증을 통과한 고침은 채택, 숫자를 바꾼 고침은 폐기하고 원문 유지", async () => {
  const good = await humanizeArticle(ROBOTIC, { revise: async () => HUMAN, threshold: 80, maxRounds: 2 });
  assert.equal(good.accepted, true);
  assert.equal(good.content, HUMAN);
  assert.equal(good.rounds, 1);
  assert.ok(good.after > good.before);

  const bad = await humanizeArticle(ROBOTIC, {
    revise: async () => HUMAN.replace("1566", "1567"),
    threshold: 80,
    maxRounds: 2,
  });
  assert.equal(bad.accepted, false);
  assert.equal(bad.content, ROBOTIC);
  assert.equal(bad.rounds, 2);
  assert.ok(bad.rejections.every((r) => /새 숫자|숫자 누락/.test(r)));
});

test("보존 줄 복원 — 모델이 라벨 줄을 손대도 자리마다 원문으로 되돌린다, 개수가 다르면 null", () => {
  const touched = HUMAN.replace("**🎯 예측 신뢰도: 높음** — 최고확률 양키스 61%", "**🎯 예측 신뢰도: 높음**, 최고확률 양키스 61%");
  assert.equal(restoreProtectedLines(ROBOTIC, touched), HUMAN);
  assert.equal(restoreProtectedLines(ROBOTIC, HUMAN.replace("## 매치업 분석\n", "")), null);
});

test("루프 — 라벨 줄을 손댄 고침은 복원해서 채택한다", async () => {
  const touched = HUMAN.replace("**🎯 예측 신뢰도: 높음** — 최고확률 양키스 61%", "**🎯 예측 신뢰도: 높음**, 최고확률 양키스 61%");
  const r = await humanizeArticle(ROBOTIC, { revise: async () => touched, threshold: 80, maxRounds: 1 });
  assert.equal(r.accepted, true);
  assert.equal(r.content, HUMAN);
});

test("루프 — 기준 이상이면 LLM 을 부르지 않는다", async () => {
  let calls = 0;
  const r = await humanizeArticle(HUMAN, {
    revise: async () => {
      calls++;
      return HUMAN;
    },
    threshold: 80,
  });
  assert.equal(calls, 0);
  assert.equal(r.rounds, 0);
});
