import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runYoutubeHighlights } from "@/jobs/fetch-youtube-highlights";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 공식 유튜브 하이라이트 매칭 — K리그1/K리그2/NBA 종료 경기에 highlightYoutubeId 적재.
// 3시간마다(vercel.json). 이미 매칭된 매치는 skip(highlightYoutubeId null 필터)이라 매우 가벼움.
export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runYoutubeHighlights();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
