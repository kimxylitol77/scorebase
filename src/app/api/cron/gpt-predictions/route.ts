// 멀티 AI 성적표 수집 cron — 예정 경기에 우리 모델 + GPT-5.5 1X2 픽 저장.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchGptPredictions } from "@/jobs/fetch-gpt-predictions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // GPT 호출 다수 — 여유 5분

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runFetchGptPredictions();
    await recordCronRun("gpt-predictions", { count: result.stored });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("gpt-predictions", { ok: false, error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
