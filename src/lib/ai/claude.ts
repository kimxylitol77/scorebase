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
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 */
export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
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
}
