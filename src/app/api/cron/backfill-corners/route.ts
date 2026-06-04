// GET /api/cron/backfill-corners
// 메이저 축구 리그(TheSports 수집 → externalId≠fixture id)의 종료경기 코너·카드를
// api-football fixture-매핑 백필로 채운다. "실제 경기 기록" 표시용 데이터 누적 + 신선도 유지.
// backlog 소진 후엔 신규 종료경기만 처리(self-limiting). limit 60 = 60s 한도 내.

import { NextResponse } from "next/server";
import { backfillMajorCornersMapped } from "@/lib/sports/api-football-corners";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAJOR = ["EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1", "UCL"];

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
    const result = await backfillMajorCornersMapped(MAJOR, 60);
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
