// AI 보조 health-check — 주 1회 (월요일) 주요 페이지를 fetch 해서
// OpenAI gpt-4o-mini 에 "이상한 점" 검토 요청.
// Rule-based 체크가 미리 정의한 패턴만 잡는다면, AI 는 새로운 종류의 이상도 발견 가능.
// 비용: 페이지 5개 × ~$0.001/페이지 = 약 $0.005/주.

import { generate } from "@/lib/ai/openai";
import type { HealthFinding } from "./types";

// 검토 대상 페이지 — 가장 트래픽 높고 데이터 누적이 많은 곳.
const PAGES: Array<{ path: string; label: string; severityIfIssue: "HIGH" | "MED" | "LOW" }> = [
  { path: "/scores", label: "라이브 스코어", severityIfIssue: "MED" },
  { path: "/predictions/EPL", label: "EPL 예측", severityIfIssue: "MED" },
  { path: "/predictions/KBO", label: "KBO 예측", severityIfIssue: "MED" },
  { path: "/predictions/NHL", label: "NHL 예측", severityIfIssue: "HIGH" },
  { path: "/predictions/LOL", label: "LCK 예측", severityIfIssue: "HIGH" },
];

interface AiIssue {
  category: string;
  severity: "HIGH" | "MED" | "LOW";
  message: string;
}

const REVIEW_SYSTEM = `당신은 한국향 스포츠 미디어 사이트의 품질 검수자입니다.
주어진 페이지 텍스트(렌더 후)를 보고 데이터/UI 이상을 찾습니다.

다음 6 카테고리만 검토하고, 각 issue 를 JSON 배열로 반환하세요:

1. season-label — 시즌 표기가 미래 시즌이거나 현재와 어긋남 (예: 2026년 5월인데 NHL "2026-27 시즌")
2. korean-leak — 한글이어야 하는데 영문 그대로 노출된 팀명/선수명
3. mismatch — 리그·소속 불일치 (예: LCK 페이지에 베트남 VCS 선수 노출)
4. placeholder — TBD/TTBD/Sabres-Canadiens 같은 미정 매치 placeholder 가 한글 변환 없이 노출
5. count-anomaly — 매치 카운트·진행률·우승확률이 시즌 진행도에 비해 비현실적
6. visual — 같은 정보가 서로 다른 표기 (예: 한 곳은 "엘링 홀란", 다른 곳은 "엘링 홀란드")

반드시 다음 JSON 형식만 출력 (배열, 최대 8개):
[
  { "category": "season-label", "severity": "HIGH", "message": "구체적 문제 1줄 설명" }
]
이상이 없으면 빈 배열 [] 만 출력.
severity 는 HIGH(즉시 fix), MED(이번 주), LOW(언젠가) 중 하나.
잡담·서론·결론 없이 JSON 만.`;

/** 페이지 텍스트에서 메인 콘텐츠 영역만 발췌 (header/footer 제거 — 토큰 절약). */
function extractMainText(html: string): string {
  // Markdown 형식 fetch 결과 그대로 ("---" 메타블록 뒤가 본문) — 너무 길면 8000 자 cut.
  const split = html.split(/^---$/m);
  const body = split.length > 2 ? split.slice(2).join("---") : html;
  return body.slice(0, 8000);
}

async function reviewOnePage(siteUrl: string, page: (typeof PAGES)[number]): Promise<HealthFinding[]> {
  const url = `${siteUrl}${page.path}`;
  // 페이지 fetch (server-side — production 도메인 호출)
  let bodyText: string;
  try {
    const r = await fetch(url, { headers: { "user-agent": "scorebase-health-bot/1" } });
    if (!r.ok) {
      return [
        {
          category: "ai-review",
          key: page.path,
          severity: "MED",
          message: `[${page.label}] HTTP ${r.status} — 페이지 응답 비정상`,
          metadata: { url, status: r.status },
        },
      ];
    }
    bodyText = await r.text();
  } catch (e) {
    return [
      {
        category: "ai-review",
        key: page.path,
        severity: "MED",
        message: `[${page.label}] fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
        metadata: { url },
      },
    ];
  }

  const text = extractMainText(bodyText);
  // 본문이 너무 짧으면 (CSR shell) 검토 의미 없음.
  if (text.length < 500) {
    return [
      {
        category: "ai-review",
        key: page.path,
        severity: "LOW",
        message: `[${page.label}] 페이지 본문 ${text.length}자 — CSR shell 의심`,
        metadata: { url, contentLength: text.length },
      },
    ];
  }

  // OpenAI 호출.
  let raw: string;
  try {
    raw = await generate(`페이지: ${url}\n\n--- 본문 ---\n${text}`, {
      system: REVIEW_SYSTEM,
      maxTokens: 1500,
      temperature: 0,
    });
  } catch (e) {
    return [
      {
        category: "ai-review",
        key: page.path,
        severity: "LOW",
        message: `[${page.label}] OpenAI 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
      },
    ];
  }

  // JSON parse — 모델이 코드 펜스를 붙일 수 있어 정리.
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "").trim();
  let issues: AiIssue[];
  try {
    issues = JSON.parse(cleaned);
    if (!Array.isArray(issues)) throw new Error("배열이 아님");
  } catch {
    return [
      {
        category: "ai-review",
        key: page.path,
        severity: "LOW",
        message: `[${page.label}] AI 응답 JSON parse 실패`,
        metadata: { rawSnippet: cleaned.slice(0, 300) },
      },
    ];
  }

  // 발견 issue 를 HealthFinding 으로 변환. 각 issue 의 severity 와 페이지 기본 severity 중 높은 쪽 채택.
  const sevOrder = { LOW: 0, MED: 1, HIGH: 2 };
  return issues.slice(0, 8).map((iss) => {
    const aiSev = (["HIGH", "MED", "LOW"] as const).includes(iss.severity) ? iss.severity : "MED";
    const finalSev =
      sevOrder[aiSev] >= sevOrder[page.severityIfIssue] ? aiSev : page.severityIfIssue;
    return {
      category: `ai-${iss.category || "review"}`,
      key: page.path,
      severity: finalSev,
      message: `[${page.label}] ${iss.message}`,
      metadata: { url, aiSeverity: aiSev, pageSeverity: page.severityIfIssue },
    } as HealthFinding;
  });
}

/** 5개 페이지 직렬 검토. 실패한 페이지는 건너뜀. */
export async function runAiReview(): Promise<HealthFinding[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [
      {
        category: "ai-review",
        key: "setup",
        severity: "LOW",
        message: "OPENAI_API_KEY 미설정 — AI 보조 검토 skip",
      },
    ];
  }
  const siteUrl = process.env.SITE_URL ?? "https://www.scorebase.kr";
  const out: HealthFinding[] = [];
  for (const page of PAGES) {
    try {
      const findings = await reviewOnePage(siteUrl, page);
      out.push(...findings);
    } catch (e) {
      out.push({
        category: "ai-review",
        key: page.path,
        severity: "LOW",
        message: `[${page.label}] 검토 함수 자체 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  return out;
}
