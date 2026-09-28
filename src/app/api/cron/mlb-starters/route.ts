import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchMlbStarters } from "@/jobs/fetch-mlb-starters";

export const dynamic = "force-dynamic";
// 불펜 3일 집계 (updateMlbBullpen — boxscore 병렬 fetch) 추가로 60→120s 여유 확보
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const tally = await runFetchMlbStarters();
    await recordCronRun("mlb-starters");
    return NextResponse.json({ ok: true, ...tally });
  } catch (e) {
    const error = (e as Error).message;
    // 실패도 기록한다 — 안 찍으면 감시가 "미실행"으로 읽어 원인 없이 알림이 온다 (2026-09-27 누락 때 그랬다)
    await recordCronRun("mlb-starters", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
