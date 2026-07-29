// 오늘의 픽 스레드 cron — 매일 KST 07:00(UTC 22:00) 게시판 허브 글 자동 발행.
// ?refresh=1 (KST 11:00·13:00) — 이미 발행된 글의 본문만 다시 만들어 덮는다.
// KBO 픽은 선발이 들어오는 KST 10:30 이후에나 채워져 아침 발행분에는 담길 수 없다.
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
  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  const refresh = sp.get("refresh") === "1";
  try {
    const result = await runDailyPickThread(dry, refresh);
    if (!dry) {
      await recordCronRun("daily-thread", {
        ok: true,
        count: result.created || result.updated ? 1 : 0,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (!dry) await recordCronRun("daily-thread", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
