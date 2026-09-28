// 야구 주간 리그 리뷰 ANALYSIS 자동 발행 cron — 주 1회. KBO 색인 글(ANALYSIS) 자산 확보용.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runBaseballWeeklyReview } from "@/jobs/generate-baseball-weekly-review";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
// 60 → 300 (2026-09-28 전수 점검). 제한에 걸리면 함수가 강제 종료돼 catch 도 못 타고 기록도 안 남는다 — 로그의 504 로만 보인다.
export const maxDuration = 300;

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
    await recordCronRun("baseball-weekly");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("baseball-weekly", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
