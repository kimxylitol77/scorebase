// 선수 경기별 출전 로그 수집 cron — 주간. af→ts 매핑 선수의 경기별 평점을 PlayerMatchLog 에 멱등 적재.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runCollectPlayerMatchLogs } from "@/jobs/collect-player-match-logs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  try {
    const result = await runCollectPlayerMatchLogs({ backfill });
    await recordCronRun("player-match-logs", { count: result.created });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("player-match-logs", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
