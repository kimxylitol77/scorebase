// 주간 이적시장 블로그 자동 발행 cron — 매주 월 09:00 KST (00:00 UTC).
// ?dry=1 → 발행 없이 데이터·제목 미리보기 (배포 후 수동 점검용).
// 얇은 주는 잡이 자체 skip (thin-week). GENERATE_DISABLED=1 시 다른 글 생성 cron 과 동일하게 중단.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runBlogWeekly } from "@/jobs/generate-blog-weekly";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // claude.ts transient retry (최대 ~155s) 여유

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  try {
    const dryRun = url.searchParams.get("dry") === "1";
    const r = await runBlogWeekly({ dryRun });
    await recordCronRun("blog-weekly");
    // htmlPreview 는 응답 비대 방지 — 길이만 노출
    const { htmlPreview, ...meta } = r;
    return NextResponse.json({ ok: true, dryRun, ...meta, htmlBytes: htmlPreview?.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
