// 축구 리그 주간 베스트 XI·MVP 자동 발행 cron — 빅5, 주 1회(화 10:00 KST).
// 발행 창은 지난 7일이라 월요일 경기까지 포함된다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runWeeklyBestXi } from "@/jobs/generate-weekly-best-xi";
import { withLlmTag } from "@/lib/ai/usage-track";
import { recordCronRun } from "@/lib/cron-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 리그 5편 × sonnet 장문

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
    const published = await withLlmTag("weekly-xi", () => runWeeklyBestXi({ dry, league, end }));
    // 기록이 없으면 감시(cron-freshness)가 이 잡을 영원히 "누락"으로 본다.
    if (!dry) await recordCronRun("weekly-xi", { ok: true, count: published });
    return NextResponse.json({ ok: true, dry, published });
  } catch (e) {
    if (!dry) await recordCronRun("weekly-xi", { ok: false });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
