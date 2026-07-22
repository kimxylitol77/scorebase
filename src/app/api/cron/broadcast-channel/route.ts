// 공개 텔레그램 채널 방송 cron — ?mode=daily 아침 카드 / ?mode=slate 야구(KBO·NPB) 하루 픽 / 기본 킥오프 전 Strong Pick. env 미설정 시 no-op.
// no-op(TELEGRAM_CHANNEL_ID 미설정)도 recordCronRun 을 남겨 cron-freshness 오탐을 막는다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import {
  broadcastDailyCard,
  broadcastKickoffPicks,
  broadcastBaseballSlates,
} from "@/jobs/broadcast-channel";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const raw = new URL(req.url).searchParams.get("mode");
  const mode = raw === "daily" || raw === "slate" ? raw : "kickoff";
  try {
    const result =
      mode === "daily"
        ? await broadcastDailyCard()
        : mode === "slate"
          ? await broadcastBaseballSlates()
          : await broadcastKickoffPicks();
    await recordCronRun("broadcast-channel");
    return NextResponse.json({ ok: true, mode, ...result });
  } catch (e) {
    await recordCronRun("broadcast-channel", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
