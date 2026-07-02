// /api/cron/transfer-rumors — 이적 루머/임박 RSS 수집 (6h). vercel.json schedule.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchTransferRumors } from "@/jobs/fetch-transfer-rumors";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runFetchTransferRumors();
    await recordCronRun("transfer-rumors", { count: result.upserted });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // 실패도 기록 — dead-man's switch 가 "미실행" 대신 "실행 실패" 로 알리게
    await recordCronRun("transfer-rumors", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
