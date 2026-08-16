// KBO 오늘의 주목 타자 Top 3 자동 발행 cron — 매일 KST 12:15 (선발 크론 이후).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runKboFeaturedHitters } from "@/jobs/generate-kbo-featured-hitters";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // 자동 발행 킬스위치 — baseball-weekly 와 동일 게이트. ?force=1 로 수동 override.
  const url = new URL(req.url);
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  try {
    const result = await withLlmTag("kbo-featured-hitters", () => runKboFeaturedHitters());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
