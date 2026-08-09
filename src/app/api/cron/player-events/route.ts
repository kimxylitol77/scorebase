// 선수 근황 이벤트 수집 cron — 주간 1회. 이적·몸값·부상을 PlayerEvent 에 멱등 적재.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runCollectPlayerEvents } from "@/jobs/collect-player-events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const backfill = new URL(req.url).searchParams.get("backfill") === "1";
  try {
    const result = await runCollectPlayerEvents({ backfill });
    await recordCronRun("player-events", { count: result.created });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("player-events", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
