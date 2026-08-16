// OpenAI Chat Completions 어댑터.
// gemini.ts 의 generate() 와 시그니처 100% 호환 — 호출부 코드 변경 없음.
//
// ⚠️ Lazy client — OpenAI SDK v6 는 생성 시점에 키 검증을 throw 한다.
// 빈 키로 바로 instantiate 하면 Vercel build 가 모듈 평가 단계에서 깨지므로
// 호출이 실제로 일어나는 시점에 만든다.

import OpenAI from "openai";
import { trackLlmUsage } from "./usage-track";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY 가 설정되지 않았습니다. .env.local 또는 Vercel 환경변수를 확인하세요.",
      );
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// 비용·품질 균형 기본값. .env 에서 OPENAI_MODEL 로 오버라이드.
// 모델 목록 / 가격: https://platform.openai.com/docs/models
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string; // 기본 OPENAI_MODEL 오버라이드 (예: 심판관은 정밀 대조용으로 상위 모델)
}

/**
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 * gemini.ts / claude.ts 의 generate() 와 동일한 시그니처.
 */
export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (opts.system) {
    messages.push({ role: "system", content: opts.system });
  }
  messages.push({ role: "user", content: prompt });

  const res = await getClient().chat.completions.create({
    model: opts.model ?? OPENAI_MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
  });

  // 계측 — 실제 서빙 모델(res.model)은 스냅샷까지 알려주므로 단가 접두사 매칭이 정확해진다.
  if (res.usage) {
    await trackLlmUsage(
      res.model || opts.model || OPENAI_MODEL,
      res.usage.prompt_tokens,
      res.usage.completion_tokens,
    );
  }

  const text = res.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI 응답이 비어 있습니다.");
  }
  return text;
}
