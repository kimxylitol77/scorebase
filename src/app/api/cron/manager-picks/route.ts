// 매니저 자동 픽 봇 cron — 매일 중요 경기 3~4개에 전문가 픽 분석글 발행.
// 수동 트리거: GET /api/cron/manager-picks?limit=4  (Bearer CRON_SECRET)

import { NextResponse } from "next/server";
import { runManagerPicks } from "@/lib/analysis/manager-bot";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 4, 1), 8);
    const result = await runManagerPicks(limit);
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
