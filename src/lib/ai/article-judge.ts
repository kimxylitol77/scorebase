// AI 생성 글을 발행 전 검수하는 심판관(LLM-as-a-judge). 팩트 충실성·SEO/GEO 스킬·페르소나를 분석형 루브릭으로 채점.
// 하이브리드 게이트: LLM 판정 + 결정론 규칙(BLOCKER 있으면 무조건 FAIL). 자기선호 편향 회피 위해 글 작성(Claude)과 다른 provider(OpenAI) 우선.
import { generate as generateOpenAI } from "@/lib/ai/openai";
import { generate as generateClaude } from "@/lib/ai/claude";
import { JUDGE_SYSTEM, buildArticleJudgePrompt } from "@/prompts/article-judge";

export type JudgeVerdict = "PASS" | "REVISE" | "FAIL";
export type JudgeSeverity = "BLOCKER" | "MAJOR" | "MINOR";

export interface JudgeIssue {
  dimension: string; // faithfulness | seo | persona | judge
  severity: JudgeSeverity;
  message: string;
}

export interface JudgeResult {
  verdict: JudgeVerdict;
  faithfulness: number; // 0~100
  seo: number;
  persona: number;
  issues: JudgeIssue[];
  summary: string;
}

export interface JudgeInput {
  content: string; // 검수 대상 본문(마크다운)
  sourceFacts: string; // 결정론적 원천 데이터(정답). 본문 수치는 여기 있어야 함.
  rubric: string; // 이 글 유형에 적용할 SEO/GEO·페르소나 체크 항목
  label?: string;
}

const SEV = new Set<JudgeSeverity>(["BLOCKER", "MAJOR", "MINOR"]);

/** 심판관 raw JSON 을 안전하게 파싱하고 결정론 판정 규칙을 재적용. */
function parseJudge(raw: string): JudgeResult {
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  // 앞뒤 잡텍스트가 붙어도 첫 { ~ 마지막 } 만 추출.
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  const json = s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // 파싱 실패 = 검수 불가 → 보수적으로 REVISE(사람이 보게), 발행은 호출부가 결정.
    return {
      verdict: "REVISE",
      faithfulness: 0,
      seo: 0,
      persona: 0,
      issues: [{ dimension: "judge", severity: "MAJOR", message: `심판관 응답 JSON 파싱 실패: ${json.slice(0, 200)}` }],
      summary: "심판관 응답 파싱 실패",
    };
  }

  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: JudgeIssue[] = rawIssues
    .map((it): JudgeIssue | null => {
      const o = it as Record<string, unknown>;
      const severity = String(o.severity ?? "").toUpperCase() as JudgeSeverity;
      if (!SEV.has(severity)) return null;
      return {
        dimension: String(o.dimension ?? "unknown"),
        severity,
        message: String(o.message ?? "").slice(0, 400),
      };
    })
    .filter((x): x is JudgeIssue => x !== null);

  // 결정론 판정 재적용 — 모델의 verdict 를 신뢰하되 severity 로 상향(관대함 방지).
  const hasBlocker = issues.some((i) => i.severity === "BLOCKER");
  const hasMajor = issues.some((i) => i.severity === "MAJOR");
  const verdict: JudgeVerdict = hasBlocker ? "FAIL" : hasMajor ? "REVISE" : "PASS";

  const num = (v: unknown, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : d;
  };

  return {
    verdict,
    faithfulness: num(obj.faithfulness, hasBlocker ? 40 : 90),
    seo: num(obj.seo, 80),
    persona: num(obj.persona, 80),
    issues,
    summary: String(obj.summary ?? "").slice(0, 300),
  };
}

/**
 * 글을 검수한다. OPENAI_API_KEY 있으면 OpenAI(작성 모델과 다른 provider) 로, 없으면 Claude 로 판정.
 * 심판관 호출 자체가 실패하면 REVISE(발행 차단 아님, 사람 검토 유도).
 */
export async function judgeArticle(input: JudgeInput): Promise<JudgeResult> {
  const prompt = buildArticleJudgePrompt(input);
  const useOpenAI = Boolean(process.env.OPENAI_API_KEY);
  // 정밀 숫자 대조는 상위 모델이 필요(mini 는 원천값을 기억으로 왜곡). JUDGE_MODEL 로 오버라이드.
  const judgeModel = process.env.JUDGE_MODEL ?? "gpt-4o";
  try {
    const raw = useOpenAI
      ? await generateOpenAI(prompt, { system: JUDGE_SYSTEM, maxTokens: 2000, temperature: 0, model: judgeModel })
      : await generateClaude(prompt, { system: JUDGE_SYSTEM, maxTokens: 2000, temperature: 0 });
    return parseJudge(raw);
  } catch (e) {
    return {
      verdict: "REVISE",
      faithfulness: 0,
      seo: 0,
      persona: 0,
      issues: [{ dimension: "judge", severity: "MAJOR", message: `심판관 호출 실패: ${(e as Error).message?.slice(0, 160)}` }],
      summary: "심판관 미작동 — 사람 검토 필요",
    };
  }
}

/** 로그·텔레그램용 한 줄 요약. */
export function formatJudgeVerdict(r: JudgeResult): string {
  const blockers = r.issues.filter((i) => i.severity === "BLOCKER").length;
  const majors = r.issues.filter((i) => i.severity === "MAJOR").length;
  return `[심판관] ${r.verdict} · 팩트 ${r.faithfulness} SEO ${r.seo} 페르소나 ${r.persona} · BLOCKER ${blockers} MAJOR ${majors} — ${r.summary}`;
}
