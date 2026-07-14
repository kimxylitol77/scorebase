// AI 생성 글 발행 전 심판관(LLM-as-a-judge) 프롬프트 — 팩트 충실성·SEO/GEO·페르소나를 분석형 루브릭으로 채점.
// 핵심: 본문의 모든 수치·이름을 '원천 데이터(정답)'에 대조해 근거 없는 것을 BLOCKER 로 표시(faithfulness).
import type { JudgeInput } from "@/lib/ai/article-judge";

export const JUDGE_SYSTEM = `너는 Scorebase 한국어 스포츠 미디어의 깐깐한 편집장이자 팩트체커다.
AI 가 쓴 글을 발행 전에 검수한다. 너의 임무는 칭찬이 아니라 결함을 찾는 것이다.
확신이 없으면 통과시키지 말고 문제로 표시한다(관대함보다 엄격함).
반드시 지정한 JSON 형식만 출력한다. 서론·잡담·코드펜스 없이 JSON 객체 하나만.`;

export function buildArticleJudgePrompt(input: JudgeInput): string {
  const L: string[] = [];

  L.push("아래 [원천 데이터]·[검수 루브릭]에 근거해 [검수 대상 본문]을 채점하라.");
  L.push("");
  L.push("=== [원천 데이터] (이것이 유일한 사실 정답. 본문의 모든 수치·선수명·팀명은 여기 있어야 한다) ===");
  L.push(input.sourceFacts);
  L.push("");
  L.push("=== [검수 루브릭] (이 글 유형에 적용할 규칙) ===");
  L.push(input.rubric);
  L.push("");
  L.push("=== [검수 대상 본문] ===");
  L.push(input.content);
  L.push("");
  L.push("=== [팩트 대조 원칙 — 반드시 지켜라] ===");
  L.push("- 오직 위 [원천 데이터] 텍스트에 적힌 값하고만 대조하라. 너의 기억·실제 세계 지식으로 판단하지 말 것. 예: 어떤 선수의 실제 소속팀을 안다고 해서 팀명이 틀렸다고 하지 말 것 — [원천 데이터]에 적힌 팀명과 본문이 다를 때만 문제다.");
  L.push("- 값을 대조할 때 반드시 [원천 데이터]의 해당 줄을 다시 읽어 확인하라. 원천에 적힌 값을 네가 다른 값으로 기억해 지적하는 것은 금지.");
  L.push("- 표기 형식 차이는 문제가 아니다: '.500' 과 '0.500' 은 같은 값이다. 앞자리 0 유무·소수 자릿수·1-0 vs 1승0패 같은 표기 차이는 무시하라. 숫자 값 자체가 실제로 다를 때만 지적하라.");
  L.push("- 원천 데이터에 아예 없는 새로운 수치(K/9, 이닝당 주자수, 비율 등 파생·계산값)가 본문에 있으면 그것은 BLOCKER 다(창작 금지 대상).");
  L.push("");
  L.push("=== [채점 절차 — 반드시 이 순서로] ===");
  L.push("1) 팩트 충실성(faithfulness): 본문에 등장하는 모든 숫자(타율·홈런·타점·OPS·ERA·이닝·탈삼진·WHIP·승패·세이브 등)와 선수명·팀명을 하나씩 뽑아, [원천 데이터]에 그 값이 그대로 있는지 위 [팩트 대조 원칙]에 따라 대조하라. 원천에 없거나 값이 실제로 다른 수치·이름이 있으면 그 각각을 severity 'BLOCKER' 로 기록한다. 팀명/선수명 음역 변형(예: '탬파베이'→'탐바베이')도 BLOCKER.");
  L.push("2) SEO/GEO 스킬 준수: 루브릭의 구조·AEO(결론 우선)·자체데이터 인용·제목 항목을 점검. 누락은 'MAJOR', 약함은 'MINOR'.");
  L.push("3) 페르소나·톤: 단정한 문어체(~다/~이다 서술체) 일관성, 이모지·클릭베이트 어휘('충격'·'경악'·'대박') 없음, 베팅·도박·픽 추천 표현 없음, 한국어 문장이 콜론(:)으로 끝나지 않음. 위반은 'MAJOR'(베팅·클릭베이트) 또는 'MINOR'(경미한 톤 흔들림).");
  L.push("");
  L.push("=== [판정 규칙] ===");
  L.push("- BLOCKER 가 하나라도 있으면 verdict='FAIL'.");
  L.push("- BLOCKER 는 없고 MAJOR 가 있으면 verdict='REVISE'.");
  L.push("- BLOCKER·MAJOR 가 없으면 verdict='PASS'(MINOR 는 허용).");
  L.push("- 각 점수는 0~100. faithfulness 는 BLOCKER 가 있으면 60 미만.");
  L.push("");
  L.push("=== [출력 형식 — 이 JSON 객체 하나만] ===");
  L.push(`{
  "verdict": "PASS" | "REVISE" | "FAIL",
  "faithfulness": 0-100,
  "seo": 0-100,
  "persona": 0-100,
  "issues": [
    { "dimension": "faithfulness" | "seo" | "persona", "severity": "BLOCKER" | "MAJOR" | "MINOR", "message": "무엇이 왜 문제인지 한 줄. 팩트 문제면 본문값 vs 원천값을 함께 적어라." }
  ],
  "summary": "한 줄 총평(한국어)"
}`);
  L.push("문제가 없으면 issues 는 빈 배열 []. JSON 외 다른 텍스트 절대 출력 금지.");

  return L.join("\n");
}
