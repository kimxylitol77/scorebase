// 가짜 회원 픽 봇 cron — 하루 1~2개 짧은 캐주얼 픽 랜덤 발행.
// 수동 트리거: GET /api/cron/fake-picks  (Bearer CRON_SECRET)

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runFakeMemberPicks } from "@/lib/analysis/fake-members";
import { runBotComments, runHitCongrats } from "@/lib/analysis/bot-comments";
import { runFreeBoardPost } from "@/lib/analysis/free-board-bot";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    // ?force=1 픽+댓글 / ?free=1 자유게시판 글 — 확률 게이트 생략(검증·수동 시딩용). 정규 cron 은 미지정.
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const freeForce = url.searchParams.get("free") === "1";
    const result = await runFakeMemberPicks(force);
    // 봇 댓글·적중 축하·자유게시판 글 — 같은 30분 주기에 편승(별도 cron 슬롯 없이). 내부 게이트로 분산.
    const comments = await runBotComments(force);
    const congrats = await runHitCongrats(force);
    const free = await runFreeBoardPost(freeForce);
    return NextResponse.json({ ok: true, ...result, comments, congrats, free });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
