"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { runEvaluateAiPredictions } from "@/jobs/fetch-gpt-predictions";
import { runPredictionPostmortems } from "@/jobs/prediction-postmortems";

export async function runPredictionAuditNow(): Promise<void> {
  await requireAdmin();
  const graded = await runEvaluateAiPredictions();
  const result = await runPredictionPostmortems({ limit: 500 });
  revalidatePath("/admin/prediction-audit");
  redirect(
    `/admin/prediction-audit?graded=${graded.graded}&analyzed=${result.analyzed}`,
  );
}
