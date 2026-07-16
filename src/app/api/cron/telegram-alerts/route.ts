// 텔레그램 경기 알림 디스패처 cron (5분). 연결 회원 없으면 즉시 skip → 비용 0.
// 끄기: TELEGRAM_ALERTS_DISABLED=1
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { dispatchTelegramAlerts } from "@/jobs/dispatch-telegram-alerts";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (process.env.TELEGRAM_ALERTS_DISABLED === "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  try {
    const result = await dispatchTelegramAlerts();
    await recordCronRun("telegram-alerts");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
