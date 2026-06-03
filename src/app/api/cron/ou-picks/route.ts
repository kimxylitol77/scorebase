// 축구 OU 전문 봇 "사관학교" cron — 예정 축구 경기 OU 픽 발행.
// 수동 트리거: GET /api/cron/ou-picks?limit=2  (Bearer CRON_SECRET)

import { NextResponse } from "next/server";
import { runOuPicks } from "@/lib/analysis/ou-bot";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 1, 1), 5);
    const result = await runOuPicks(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
