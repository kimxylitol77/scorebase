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
// 기본 모델 haiku-4-5: 2026-05-27 sonnet large output (NPB 8KB prompt + maxTokens 4096)
// 가 180s+ stuck 케이스 발견 → cron 4번 모두 0건 처리. haiku 는 동일 prompt 10s 내 응답.
// 글 quality 차이 vs 처리 가능성 균형 — env 로 override 가능.
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

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
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  if (e.status === 408 || e.status === 429 || e.status === 529) return true;
  if (e.status != null && e.status >= 500 && e.status < 600) return true;
  // AbortController abort (per-attempt wall-clock timeout) — transient 로 retry
  if (e.name === "AbortError") return true;
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("connection") || msg.includes("network") || msg.includes("timeout") || msg.includes("econn") || msg.includes("aborted")) return true;
  return false;
}

/**
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 * 일시 에러는 점진 backoff retry (5회 — 5s / 10s / 20s / 40s / 80s, ±20% jitter).
 * 총 최대 대기 ~155s — 529 overloaded burst 통과용 (2026-05-21 확장).
 * cron maxDuration 300s 의 1/2 미만 — 매치 1건 fail 후에도 다른 매치 처리 여유.
 */
async function generateAnthropic(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  // 8KB+ prompt + maxTokens 4096 인 NPB/MLB 매치 1건 sonnet generate 가 90~150s
  // 걸리는 케이스 흔함 (2026-05-27 진단). cron maxDuration 300s 안에 1-2 매치
  // 처리 + 일시 hang 회피 위해 backoff 짧게 + per-attempt 180s.
  const backoffs = [3000, 8000];
  const ATTEMPT_TIMEOUT_MS = 180_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await claude.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: opts.maxTokens ?? 4096,
          temperature: opts.temperature ?? 0.7,
          system: opts.system,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: ctrl.signal, timeout: ATTEMPT_TIMEOUT_MS },
      );
      const textBlocks = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text);
      if (textBlocks.length === 0) {
        throw new Error("Claude 응답에 텍스트 블록이 없습니다.");
      }
      clearTimeout(t);
      return textBlocks.join("\n");
    } catch (err) {
      clearTimeout(t);
      lastErr = err;
      if (attempt >= backoffs.length || !isTransient(err)) throw err;
      // ±20% jitter — 동시 529 폭주 시 retry 충돌 회피
      const base = backoffs[attempt];
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
      const wait = Math.max(1000, Math.round(base + jitter));
      const status = (err as { status?: number }).status;
      const aborted = (err as { name?: string }).name === "AbortError";
      const tag = aborted ? "timeout" : status ? `${status}` : "net";
      console.warn(
        `[claude] retry ${attempt + 1}/${backoffs.length} (${tag}) after ${wait}ms — ${(err as Error).message?.slice(0, 120)}`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * 기사 텍스트 생성 — Anthropic 우선, 크레딧 소진·장애 시 OpenAI(gpt-4o-mini) 자동 폴백.
 * AI_PROVIDER=openai 면 Anthropic 건너뛰고 OpenAI 직행 (크레딧 0 동안 400 왕복 회피).
 * 호출부(generateWithMinLength → 모든 글 생성)는 이 함수만 쓰면 됨.
 */
export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  if (process.env.AI_PROVIDER === "openai") {
    const { generate: generateOpenAI } = await import("./openai");
    return generateOpenAI(prompt, opts);
  }
  try {
    return await generateAnthropic(prompt, opts);
  } catch (err) {
    // 크레딧 소진(400)·인증·지속 장애 등 Anthropic 최종 실패 시 OpenAI 폴백.
    if (process.env.OPENAI_API_KEY) {
      console.warn(
        `[ai] Anthropic 생성 실패 → OpenAI 폴백: ${(err as Error).message?.slice(0, 120)}`,
      );
      const { generate: generateOpenAI } = await import("./openai");
      return generateOpenAI(prompt, opts);
    }
    throw err;
  }
}
