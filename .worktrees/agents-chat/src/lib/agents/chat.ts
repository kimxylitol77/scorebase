// LLM 어댑터 — /admin/agents 채팅용.
// 우선순위: Ollama (맥미니 endpoint, 무료) → Anthropic Claude → OpenAI gpt-4o-mini
// .env 의 AGENT_LLM_PROVIDER 로 강제 가능: "ollama" | "claude" | "openai"

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

const PROVIDER = (process.env.AGENT_LLM_PROVIDER ?? "auto").toLowerCase();
const OLLAMA_URL = process.env.OLLAMA_URL; // 예: http://100.x.x.x:11434 (맥미니 Tailscale)
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:14b";

async function chatOllama(messages: ChatMessage[]): Promise<ChatResult> {
  if (!OLLAMA_URL) throw new Error("OLLAMA_URL 미설정");
  const r = await fetch(`${OLLAMA_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.7, num_predict: 2048 },
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Ollama ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = (await r.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = data.message?.content?.trim() ?? "";
  if (!text) throw new Error("Ollama 응답 비어있음");
  return {
    text,
    model: `ollama/${OLLAMA_MODEL}`,
    inputTokens: data.prompt_eval_count,
    outputTokens: data.eval_count,
  };
}

async function chatAnthropic(messages: ChatMessage[]): Promise<ChatResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY 미설정");
  // system 메시지는 별도 인자로 — Anthropic API 규약
  const systemMsg = messages.find((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: systemMsg?.content,
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = (await r.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("Anthropic 응답 비어있음");
  return {
    text,
    model: `claude/${model}`,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

async function chatOpenAi(messages: ChatMessage[]): Promise<ChatResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY 미설정");
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("OpenAI 응답 비어있음");
  return {
    text,
    model: `openai/${model}`,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

/**
 * 자동 라우팅: Ollama 가능하면 우선 (무료), 아니면 Claude, 아니면 OpenAI.
 * .env 의 AGENT_LLM_PROVIDER 로 강제 가능.
 */
export async function chatWithLLM(messages: ChatMessage[]): Promise<ChatResult> {
  if (PROVIDER === "ollama") return chatOllama(messages);
  if (PROVIDER === "claude" || PROVIDER === "anthropic") return chatAnthropic(messages);
  if (PROVIDER === "openai") return chatOpenAi(messages);

  // auto — Ollama URL 있으면 시도, 실패하면 fallback
  if (OLLAMA_URL) {
    try {
      return await chatOllama(messages);
    } catch (e) {
      console.warn("[agents/chat] Ollama 실패 — Claude 로 fallback:", e instanceof Error ? e.message : e);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await chatAnthropic(messages);
    } catch (e) {
      console.warn("[agents/chat] Claude 실패 — OpenAI 로 fallback:", e instanceof Error ? e.message : e);
    }
  }
  return chatOpenAi(messages);
}
