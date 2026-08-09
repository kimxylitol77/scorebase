// 멀티 AI 성적표 수집 cron — 예정 경기에 우리 모델 + GPT-5.6 1X2 픽 저장.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchGptPredictions } from "@/jobs/fetch-gpt-predictions";
import { runGenerateMemberBotPicks } from "@/jobs/generate-member-bot-picks";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // GPT 호출 다수 — 여유 5분

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runFetchGptPredictions();
    // 회원 커스텀 봇 픽 생성 피기백 — 향후 24h 저장 pred 매치 (실패해도 본 잡 영향 없음)
    const memberBotPicks = await runGenerateMemberBotPicks().catch(() => null);
    await recordCronRun("gpt-predictions", { count: result.stored });
    return NextResponse.json({ ok: true, ...result, memberBotPicks });
  } catch (e) {
    await recordCronRun("gpt-predictions", { ok: false, error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
