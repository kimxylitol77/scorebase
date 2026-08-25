// 축구 빅5 주간 리뷰 자동 발행 cron — 주 1회(화 02:00 UTC = 11:00 KST).
// weekly-xi(01:00 UTC) 가 먼저 돌아 MVP 선수 산식이 같은 창으로 정렬된 뒤 발행한다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runSoccerWeeklyReview } from "@/jobs/generate-soccer-weekly-review";
import { withLlmTag } from "@/lib/ai/usage-track";
import { recordCronRun } from "@/lib/cron-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 리그 5편 × haiku 장문

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  // 자동 발행 킬스위치 — 다른 발행 cron 과 동일 게이트. ?force=1 로 수동 override.
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  const dry = url.searchParams.get("dry") === "1";
  const league = url.searchParams.get("league") ?? undefined;
  const end = url.searchParams.get("end") ?? undefined;
  try {
    const published = await withLlmTag("soccer-weekly", () =>
      runSoccerWeeklyReview({ dry, league, end }),
    );
    if (!dry) await recordCronRun("soccer-weekly-review", { ok: true, count: published });
    return NextResponse.json({ ok: true, dry, published });
  } catch (e) {
    if (!dry) await recordCronRun("soccer-weekly-review", { ok: false });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
