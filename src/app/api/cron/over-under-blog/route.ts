// 오버/언더 허브 블로그 글 주간 갱신 cron — 매주 월요일. 리그·팀 표를 최신 집계로 다시 쓴다.
// 리그별 페이지(/over-under/[league])는 요청 때마다 다시 계산되므로 이 cron 은 블로그 글만 담당한다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { buildAndSaveOverUnderBlog } from "@/lib/stats/over-under-blog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const r = await buildAndSaveOverUnderBlog();
    await recordCronRun("over-under-blog");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[cron/over-under-blog]", e);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
