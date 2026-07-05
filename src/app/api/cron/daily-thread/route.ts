// 오늘의 픽 스레드 cron — 매일 KST 07:00(UTC 22:00) 게시판 허브 글 자동 발행.
// 수동: GET /api/cron/daily-thread (Bearer CRON_SECRET) · 미리보기: ?dry=1

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runDailyPickThread } from "@/lib/analysis/daily-thread";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const result = await runDailyPickThread(dry);
    if (!dry) await recordCronRun("daily-thread", { ok: true, count: result.created ? 1 : 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (!dry) await recordCronRun("daily-thread", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
