// /api/cron/presence-cleanup — 실시간 접속(ActivePresence) 만료 행 삭제. 하루 1회.
// presence 는 "지금 어디를 보고 있나" 스냅샷이라 조회 창이 최대 5분이다.
// 삭제 잡이 없으면 탭마다 행이 남아 테이블만 계속 커진다(실측 시간당 75~100행).
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 보존 기간. 조회는 5분 창만 쓰지만, 하루치는 사후 점검용으로 남긴다. */
const RETAIN_HOURS = 24;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETAIN_HOURS * 60 * 60 * 1000);
  try {
    const { count } = await prisma.activePresence.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });
    await recordCronRun("presence-cleanup", { ok: true, count });
    return NextResponse.json({ ok: true, deleted: count, cutoff });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordCronRun("presence-cleanup", { ok: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
