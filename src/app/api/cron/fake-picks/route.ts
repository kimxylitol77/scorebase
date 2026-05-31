// 가짜 회원 픽 봇 cron — 하루 1~2개 짧은 캐주얼 픽 랜덤 발행.
// 수동 트리거: GET /api/cron/fake-picks  (Bearer CRON_SECRET)

import { NextResponse } from "next/server";
import { runFakeMemberPicks } from "@/lib/analysis/fake-members";
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
    const result = await runFakeMemberPicks();
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
