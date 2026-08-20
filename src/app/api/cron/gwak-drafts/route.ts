import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runGwakAutoPosts } from "@/lib/analysis/gwak-pickster";
import { withLlmTag } from "@/lib/ai/usage-track";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const url = new URL(req.url);
    // 하루 세 차례 실행하되 매번 1개만 — 게시판에 같은 시각 다발행하지 않는다.
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 1, 1), 1);
    const result = await withLlmTag("gwak-drafts", () => runGwakAutoPosts(limit));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
