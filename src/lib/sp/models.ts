// sportspredictions.live 성적표의 모델 표시 메타 — /en/predictions/scorecard 의 MODEL_META 와 같은 이름 규칙.
import { isGptScorecardModel } from "@/lib/predict/gpt-scorecard-model";

export interface SpModelMeta {
  key: string;
  label: string;
  vendor: string;
  order: number;
}

const META: Record<string, SpModelMeta> = {
  scorebase: { key: "scorebase", label: "Scorebase Model", vendor: "Elo + Dixon-Coles + market blend", order: 0 },
  gpt: { key: "gpt", label: "GPT-5.6", vendor: "OpenAI", order: 1 },
  claude: { key: "claude", label: "Claude", vendor: "Anthropic", order: 2 },
  grok: { key: "grok", label: "Grok", vendor: "xAI", order: 3 },
  gemini: { key: "gemini", label: "Gemini", vendor: "Google", order: 4 },
  "kimi-k3": { key: "kimi-k3", label: "Kimi K3", vendor: "Moonshot", order: 5 },
  "qwen2.5-32b": { key: "qwen2.5-32b", label: "Qwen 2.5", vendor: "Alibaba (local)", order: 6 },
};

export function normModel(m: string): string {
  return isGptScorecardModel(m) ? "gpt" : m;
}
export function modelMeta(m: string): SpModelMeta {
  return META[m] ?? { key: m, label: m, vendor: "", order: 9 };
}
