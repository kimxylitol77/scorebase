import Anthropic from "@anthropic-ai/sdk";
import { generate as generateOpenAI } from "./openai";
import { trackLlmUsage } from "./usage-track";

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
  // 호출별 모델 override (예: 해외 브리핑 재작성 = claude-sonnet-5).
  // 주의: Claude 5 계열·Opus 4.7+ 는 temperature 등 sampling 파라미터에 400 을 던지므로
  // model 지정 시 temperature 를 아예 전송하지 않는다 (톤은 프롬프트로 제어).
  model?: string;
  // 시도당 타임아웃 override — sonnet 장문(3000자+)은 기본 180s 를 초과함 (감독 전술 글 실측).
  timeoutMs?: number;
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
 * max_tokens 절단 본문 마무리 — 문장 중간에서 끊긴 채 발행되는 것 방지 (2026-07-02 감사 A4).
 * 마지막 문단/문장 종결 지점까지 트림. 절반 이상 잘리는 경우엔 원문 유지(과도 손실 방지).
 */
function trimToCompleteSentence(text: string): string {
  let t = text.trimEnd();
  const floor = Math.floor(t.length * 0.5);
  // 문단 트림이 고아 헤딩("## …"만 남음)·수평선을 남기지 않게 반복 정리
  for (let iter = 0; iter < 6; iter++) {
    const stripped = t.replace(/(\n#{1,6} [^\n]*|\n-{3,})\s*$/g, "").trimEnd();
    if (stripped !== t) {
      t = stripped;
      continue;
    }
    if (/[.!?다요)\]」』*|>~%]$/.test(t)) return t; // 문장 종결·표행·인용으로 끝남
    const cut = t.lastIndexOf("\n\n");
    if (cut > floor) {
      t = t.slice(0, cut).trimEnd();
      continue;
    }
    for (let i = t.length - 1; i >= floor; i--) {
      if (".!?".includes(t[i])) return t.slice(0, i + 1);
    }
    return t; // 더 자를 수 없음 — 원문 유지 (과도 손실 방지)
  }
  return t;
}

/**
 * 단발 텍스트 생성 1회 시도 (transient retry 포함).
 * 일시 에러는 점진 backoff retry (5회 — 5s / 10s / 20s / 40s / 80s, ±20% jitter).
 * 총 최대 대기 ~155s — 529 overloaded burst 통과용 (2026-05-21 확장).
 * cron maxDuration 300s 의 1/2 미만 — 매치 1건 fail 후에도 다른 매치 처리 여유.
 */
async function callAnthropicOnce(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<{ text: string; truncated: boolean }> {
  // 8KB+ prompt + maxTokens 4096 인 NPB/MLB 매치 1건 sonnet generate 가 90~150s
  // 걸리는 케이스 흔함 (2026-05-27 진단). cron maxDuration 300s 안에 1-2 매치
  // 처리 + 일시 hang 회피 위해 backoff 짧게 + per-attempt 180s.
  const backoffs = [3000, 8000];
  const ATTEMPT_TIMEOUT_MS = opts.timeoutMs ?? 180_000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      // 스트리밍 수신 — 장문(sonnet 8192)의 비스트리밍 요청은 에지에서 Connection error 로
      // 끊기는 케이스 실측(2026-07-18 감독 전술 글, 3/4편 폴백 강등). 청크가 계속 흘러
      // 유휴 연결 종료를 회피한다. finalMessage() 가 기존과 동일한 Message 를 돌려준다.
      const stream = claude.messages.stream(
        {
          model: opts.model ?? CLAUDE_MODEL,
          max_tokens: opts.maxTokens ?? 4096,
          ...(opts.model ? {} : { temperature: opts.temperature ?? 0.7 }),
          system: opts.system,
          messages: [{ role: "user", content: prompt }],
        },
        { signal: ctrl.signal, timeout: ATTEMPT_TIMEOUT_MS },
      );
      const response = await stream.finalMessage();
      await trackLlmUsage(
        response.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      );
      const textBlocks = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text);
      if (textBlocks.length === 0) {
        throw new Error("Claude 응답에 텍스트 블록이 없습니다.");
      }
      clearTimeout(t);
      return {
        text: textBlocks.join("\n"),
        truncated: response.stop_reason === "max_tokens",
      };
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
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 * max_tokens 절단 감지 시 상향(2배, 최대 8192) 재시도 1회 — 그래도 잘리면 완결 문장까지 트림
 * 후 반환 (문장 중간에서 끊긴 본문이 그대로 발행되던 문제 수정, 2026-07-02 감사 A4).
 */
async function generateAnthropic(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  let r = await callAnthropicOnce(prompt, opts);
  if (r.truncated) {
    const bumped = Math.min(8192, (opts.maxTokens ?? 4096) * 2);
    console.warn(
      `[claude] max_tokens 절단 감지 — maxTokens ${opts.maxTokens ?? 4096}→${bumped} 재시도`,
    );
    r = await callAnthropicOnce(prompt, { ...opts, maxTokens: bumped });
    if (r.truncated) {
      console.warn("[claude] 재시도도 절단 — 완결 문장까지 트림 후 반환");
      return trimToCompleteSentence(r.text);
    }
  }
  return r.text;
}

/**
 * 웹 검색 기반 생성 — Anthropic web_search 서버 도구로 실시간 정보를 검색한 뒤 답한다.
 * (예상 라인업처럼 학습 지식만으론 낡거나 틀리는 사실을 매체에서 끌어올 때 사용.)
 * 서버 도구라 검색은 API 가 실행하며, 최종 text 블록만 반환한다. 실패 시 예외를 던지므로
 * 호출부는 반드시 try/catch 로 감싸 라인업 생략 등 fallback 을 둘 것.
 */
export async function generateWithWebSearch(
  prompt: string,
  opts: GenerateOptions & { maxUses?: number } = {},
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  // web_search 는 서버 도구라 검색 왕복 동안 stop_reason=pause_turn 으로 끊길 수 있다.
  // 그 경우 직전 assistant content 를 이어붙여 재요청해야 최종 text 가 나온다 (최대 4턴).
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  try {
    for (let turn = 0; turn < 4; turn++) {
      const response = await claude.messages.create(
        {
          model: opts.model ?? CLAUDE_MODEL,
          max_tokens: opts.maxTokens ?? 2048,
          system: opts.system,
          messages,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: opts.maxUses ?? 3 }],
        },
        { signal: ctrl.signal, timeout: 120_000 },
      );
      // 검색 왕복은 pause_turn 으로 여러 턴에 걸쳐 과금되므로 턴마다 기록한다.
      await trackLlmUsage(
        response.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      );
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!text) throw new Error("web_search 응답에 텍스트 블록이 없습니다.");
      return text;
    }
    throw new Error("web_search pause_turn 4턴 초과 — 최종 응답 없음");
  } finally {
    clearTimeout(t);
  }
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
      // claude 모델명이 OpenAI 로 넘어가면 404 model_not_found — override 는 폴백에서 제거.
      const model = opts.model?.startsWith("claude") ? undefined : opts.model;
      return generateOpenAI(prompt, { ...opts, model });
    }
    throw err;
  }
}
