// OpenAI Chat Completions 어댑터.
// gemini.ts 의 generate() 와 시그니처 100% 호환 — 호출부 코드 변경 없음.

import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[openai] OPENAI_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.",
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

// 비용·품질 균형 기본값. .env 에서 OPENAI_MODEL 로 오버라이드.
// 모델 목록 / 가격: https://platform.openai.com/docs/models
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
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

  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.7,
  });

  const text = res.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI 응답이 비어 있습니다.");
  }
  return text;
}
