// 확정 라인업 자동 발행 cron (10분). LLM 비용 0이라 기본 ON — LINEUP_POST_DISABLED=1 로 끔.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runGenerateLineupPost } from "@/jobs/generate-lineup-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (process.env.LINEUP_POST_DISABLED === "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  try {
    const result = await runGenerateLineupPost();
    await recordCronRun("lineup-post");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
