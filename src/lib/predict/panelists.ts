// 멀티 LLM 성적표의 패널(예측 모델) 레지스트리 — 좌석을 한 곳에서 정의한다.
// 모든 패널은 OpenAI 호환 규격(chat.completions + json_object)으로 호출된다:
//   - openai:     OpenAI 직접 (기존 GPT)
//   - openrouter: 키 1개로 Claude·Grok·Gemini (baseURL=openrouter)
//   - ollama:     로컬 Qwen (맥미니 localhost:11434, Vercel 에선 못 닿음 → 워커 실행)
// scorebase(정량 결정론 모델)는 LLM 이 아니라 앵커이므로 이 레지스트리 밖에 있다.
import { GPT_SCORECARD_ACTIVE_MODEL } from "./gpt-scorecard-model";

export type PanelRuntime = "openai" | "openrouter" | "ollama" | "xai" | "moonshot";

export interface Panelist {
  /** AiPrediction.model 에 저장되는 문자열. 채점·집계의 안정 키이므로 변경 금지. */
  key: string;
  /** 화면 표기용 라벨. */
  label: string;
  /** 페이지 액센트 색(P4 리더보드에서 사용). */
  accent: string;
  runtime: PanelRuntime;
  /** provider 에 넘길 모델 id (OpenRouter/Ollama 는 provider 규격). */
  modelId: string;
  /** OpenAI 호환 baseURL. openai 는 기본값이므로 생략. */
  baseURL?: string;
  /** API 키 env 이름. ollama 는 불필요. */
  apiKeyEnv?: string;
  /** 활성 게이트 env 이름. 없으면 항상 활성(기존 gpt 하위호환). 값이 "1"|"true" 일 때만 호출. */
  enabledEnv?: string;
  /** 실행 위치. ollama 패널은 macmini 에서만(Vercel 잡은 스킵). */
  location: "vercel" | "macmini";
  /** response_format:json_object 지원 여부. Anthropic(OpenRouter)은 미지원 → false. 기본 true. */
  jsonMode?: boolean;
  /** 생각 과정을 토큰으로 쓰는 모델의 강도. 미지정이면 파라미터를 안 보낸다(=provider 기본). */
  reasoningEffort?: "none" | "low" | "medium" | "high";
}

// OpenRouter 모델 id 는 P3 에서 실제 호출로 검증할 것(게이트 OFF 라 P1~2 미호출).
export const PANELISTS: Panelist[] = [
  {
    key: GPT_SCORECARD_ACTIVE_MODEL, // "gpt-5.6" — 기존 GPT, 하위호환(게이트 없음=항상 활성)
    label: "GPT",
    accent: "emerald",
    runtime: "openai",
    modelId: GPT_SCORECARD_ACTIVE_MODEL,
    apiKeyEnv: "OPENAI_API_KEY",
    location: "vercel",
  },
  {
    key: "claude",
    label: "Claude",
    accent: "violet",
    runtime: "openrouter",
    modelId: "anthropic/claude-haiku-4.5", // Haiku=저렴, 단발 JSON 픽에 충분(Opus 는 과비용)
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    enabledEnv: "PANEL_CLAUDE",
    location: "vercel",
    jsonMode: false, // Anthropic 은 OpenRouter 에서 response_format:json_object 미지원 → 프롬프트+파싱으로
  },
  {
    key: "grok",
    label: "Grok",
    accent: "sky",
    runtime: "xai", // xAI 직접(무료 크레딧). OpenAI 호환, baseURL 만 다름.
    modelId: "grok-4-1-fast-non-reasoning", // 저렴·빠름, 단발 JSON 픽에 적합
    baseURL: "https://api.x.ai/v1",
    apiKeyEnv: "XAI_API_KEY",
    enabledEnv: "PANEL_GROK",
    location: "vercel",
  },
  {
    key: "gemini",
    label: "Gemini",
    accent: "amber",
    runtime: "openrouter",
    modelId: "google/gemini-2.5-flash", // 저렴·빠름, JSON 픽에 적합
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    enabledEnv: "PANEL_GEMINI",
    location: "vercel",
  },
  {
    key: "kimi-k3",
    label: "Kimi",
    accent: "indigo",
    runtime: "moonshot", // Moonshot 직접. OpenAI 호환, max_tokens 규격.
    modelId: "kimi-k3",
    baseURL: "https://api.moonshot.ai/v1",
    apiKeyEnv: "MOONSHOT_API_KEY",
    enabledEnv: "PANEL_KIMI",
    location: "vercel",
    // 실측(2026-07-21): 기본 강도 17.9초(생각 188토큰) vs low 6.1초(생각 4토큰), 픽·근거는 동일.
    // 패널 호출이 순차 루프라 느린 좌석 하나가 전체 처리량을 깎는다 → 단발 JSON 픽에는 low.
    // 생각 토큰이 max_tokens 를 함께 먹으므로 상한이 낮으면 본문이 빈 채로 잘리는 점도 주의.
    reasoningEffort: "low",
  },
  {
    key: "qwen2.5-32b",
    label: "Qwen (로컬)",
    accent: "teal",
    runtime: "ollama",
    modelId: "qwen2.5:32b", // 맥미니 Ollama 실 모델
    baseURL: "http://localhost:11434/v1",
    enabledEnv: "PANEL_QWEN",
    location: "macmini",
  },
];

/** 게이트 env 가 켜졌는지. 게이트가 없으면 항상 true(기존 gpt). */
export function isPanelEnabled(p: Panelist): boolean {
  if (!p.enabledEnv) return true;
  const v = process.env[p.enabledEnv]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** 패널 key 로 게이트 확인. 미등록 key 는 false. Qwen 처럼 activePanelists 를 안 타는 경로용. */
export function isPanelEnabledByKey(key: string): boolean {
  const p = PANELISTS.find((x) => x.key === key);
  return p ? isPanelEnabled(p) : false;
}

/** 특정 실행 위치에서 활성화되고 키가 준비된 패널만. */
export function activePanelists(location: "vercel" | "macmini"): Panelist[] {
  return PANELISTS.filter((p) => {
    if (p.location !== location) return false;
    if (!isPanelEnabled(p)) return false;
    if (p.apiKeyEnv && !process.env[p.apiKeyEnv]) return false;
    return true;
  });
}
