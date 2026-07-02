import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchMlbStarters } from "@/jobs/fetch-mlb-starters";
import { prisma } from "@/lib/db";

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
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
