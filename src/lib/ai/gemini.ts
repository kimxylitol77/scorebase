import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GOOGLE_API_KEY) {
  console.warn(
    "[gemini] GOOGLE_API_KEY 가 설정되지 않았습니다. .env.local 을 확인하세요.",
  );
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");

// 모델명은 .env 에서 주입. 미설정 시 비용·속도 균형 잡힌 기본값.
// 모델 목록: https://ai.google.dev/gemini-api/docs/models
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

export interface GenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * 단발 텍스트 생성. 기사 초안 작성에 사용.
 * Anthropic Claude 의 generate() 와 동일한 시그니처를 유지하므로
 * 호출부 코드는 변경 없음.
 */
export async function generate(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.7,
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  if (!text) {
    throw new Error("Gemini 응답이 비어 있습니다.");
  }

  return text.trim();
}
