import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "[claude] ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.",
  );
}

export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

// 모델명은 .env 에서 주입. 미설정 시 기본값 사용.
// 최신 모델 목록: https://docs.anthropic.com/en/docs/about-claude/models
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Claude API 일시 장애 / connection / rate-limit (429, 529) 회피용 점진 backoff.
 * 5xx, 408, 429, 529, 네트워크 에러는 retry.
 */
function isTransient(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; code?: string; message?: string };
  if (e.status === 408 || e.status === 429 || e.status === 529) return true;
  if (e.status != null && e.status >= 500 && e.status < 600) return true;
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("connection") || msg.includes("network") || msg.includes("timeout") || msg.includes("econn")) return true;
  return false;
}

/**
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 * 일시 에러는 점진 backoff retry (5회 — 5s / 10s / 20s / 40s / 80s, ±20% jitter).
 * 총 최대 대기 ~155s — 529 overloaded burst 통과용 (2026-05-21 확장).
 * cron maxDuration 300s 의 1/2 미만 — 매치 1건 fail 후에도 다른 매치 처리 여유.
 */
export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const backoffs = [5000, 10000, 20000, 40000, 80000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const response = await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.7,
        system: opts.system,
        messages: [{ role: "user", content: prompt }],
      });
      const textBlocks = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text);
      if (textBlocks.length === 0) {
        throw new Error("Claude 응답에 텍스트 블록이 없습니다.");
      }
      return textBlocks.join("\n");
    } catch (err) {
      lastErr = err;
      if (attempt >= backoffs.length || !isTransient(err)) throw err;
      // ±20% jitter — 동시 529 폭주 시 retry 충돌 회피
      const base = backoffs[attempt];
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
      const wait = Math.max(1000, Math.round(base + jitter));
      const status = (err as { status?: number }).status;
      const tag = status ? `${status}` : "net";
      console.warn(
        `[claude] retry ${attempt + 1}/${backoffs.length} (${tag}) after ${wait}ms — ${(err as Error).message?.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
