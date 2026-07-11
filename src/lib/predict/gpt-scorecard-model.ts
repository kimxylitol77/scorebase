export const GPT_SCORECARD_ACTIVE_MODEL =
  process.env.GPT_PREDICT_MODEL?.trim() || "gpt-5.6";

export const GPT_SCORECARD_LEGACY_MODELS = ["gpt-5.5"] as const;

export function isGptScorecardModel(model: string): boolean {
  return (
    model === GPT_SCORECARD_ACTIVE_MODEL ||
    GPT_SCORECARD_LEGACY_MODELS.some((legacy) => legacy === model)
  );
}

export function preferGptScorecardModel(
  currentModel: string | undefined,
  candidateModel: string,
): boolean {
  if (!isGptScorecardModel(candidateModel)) return false;
  return currentModel == null || candidateModel === GPT_SCORECARD_ACTIVE_MODEL;
}

export function gptScorecardModelLabel(model: string): string {
  if (model === "gpt-5.6" || model === "gpt-5.6-sol") return "GPT-5.6 Sol";
  if (model === "gpt-5.6-terra") return "GPT-5.6 Terra";
  if (model === "gpt-5.6-luna") return "GPT-5.6 Luna";
  if (model === "gpt-5.5") return "GPT-5.5";
  return model;
}
