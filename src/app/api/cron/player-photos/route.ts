// 선수 사진 백필 cron — 하루 2회, 회당 300명씩 결손을 메운다(멱등·페이스 준수).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runBackfillPlayerPhotos } from "@/jobs/backfill-player-photos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const res = await runBackfillPlayerPhotos();
    await recordCronRun("player-photos", { ok: true, count: res.filled });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await recordCronRun("player-photos", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
