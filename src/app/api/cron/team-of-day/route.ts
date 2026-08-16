// 월드컵 '오늘의 베스트 XI' 평점 분석 글 + STAR 리포트(주인공 선수 단독 글) 자동 발행 cron.
// 매일 KST 오후(그날 경기 평점 집계 후). 둘 다 전 경기 종료 가드로 idempotent.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runTeamOfDayArticle } from "@/jobs/generate-team-of-day-article";
import { runWcStarReport } from "@/jobs/generate-wc-star-report";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 베스트11 1글 + STAR 최대 2글(haiku) 여유

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // 자동 발행 일시 중단 스위치 (analysis cron 과 동일) — ?force=1 로 override.
  const url = new URL(req.url);
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  try {
    await withLlmTag("team-of-day", () => runTeamOfDayArticle());
    // STAR 리포트는 베스트11 에 피기백 — 실패해도 베스트11 발행은 유지되도록 격리.
    try {
      await withLlmTag("team-of-day", () => runWcStarReport());
    } catch (e) {
      console.warn("[cron/team-of-day] STAR 리포트 실패:", (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
