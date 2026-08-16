// 야구 주간 리그 리뷰 ANALYSIS 자동 발행 cron — 주 1회. KBO 색인 글(ANALYSIS) 자산 확보용.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runBaseballWeeklyReview } from "@/jobs/generate-baseball-weekly-review";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // 자동 발행 킬스위치 — analysis cron 과 동일 게이트. ?force=1 로 수동 override.
  const url = new URL(req.url);
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  try {
    await withLlmTag("baseball-weekly", () => runBaseballWeeklyReview());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
