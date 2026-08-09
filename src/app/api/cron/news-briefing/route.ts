// 해외 축구 브리핑 cron — Tier1 소스 수집→재작성→검증→커뮤니티 발행 (2h 간격)
import { NextResponse } from "next/server";
import { recordCronRun } from "@/lib/cron-registry";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runNewsBriefing } from "@/jobs/fetch-news-briefing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runNewsBriefing();
    await recordCronRun("news-briefing", { count: result.published });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("news-briefing", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
