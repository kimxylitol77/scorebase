// UFC 라이브 status cron — ESPN scoreboard 로 진행 중/종료 경기를 LIVE/FINISHED 전환.
// 경기 시간대(KST 새벽)에 짧은 주기로 호출. The Odds(완료만 제공)의 라이브 공백 보완.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runEnrichMmaLive } from "@/jobs/enrich-mma-espn";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const r = await runEnrichMmaLive();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
