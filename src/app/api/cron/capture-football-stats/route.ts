// GET /api/cron/capture-football-stats
// 종료된 축구 경기의 코너·카드·슈팅·점유율을 TheSports cache 에서 캡처 → MatchStats 적재.
// 코너/카드 예측 모델 학습 데이터셋을 누적한다. cache 는 유지되므로 6h 주기로 충분.

import { NextResponse } from "next/server";
import { captureFootballMatchStats } from "@/lib/sports/thesports/football-match-stats";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const result = await captureFootballMatchStats();
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
