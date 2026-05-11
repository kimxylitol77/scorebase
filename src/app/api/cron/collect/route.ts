import { NextResponse } from "next/server";
import { runCollect } from "@/jobs/collect";
import { prisma } from "@/lib/db";
import type { League } from "@/lib/sports/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALL_LEAGUES: League[] = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "NBA",
  "NHL",
  "MLB",
  "LOL",
  // KBO 는 데이터 소스 정비 후 추후 재오픈
];

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    // 어제 + 오늘 + 향후 7일 매치 일정/스코어 수집
    // pastDays=2: 어제 시작·오늘 새벽 끝난 매치의 score/status 보정 (RECAP 잡 트리거에 필수)
    // futureDays=7: 미래 SCHEDULED 매치도 채워서 PREVIEW 잡이 잡아갈 수 있게 함
    await runCollect({ leagues: ALL_LEAGUES, pastDays: 2, futureDays: 7 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
