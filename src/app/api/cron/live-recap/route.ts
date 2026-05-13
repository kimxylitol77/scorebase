// 매 10분 도는 통합 cron — 종료 매치 status 갱신 + RECAP 즉시 발행
//
// 흐름:
//   1. 오늘(KST) 모든 리그 매치 collect (pastDays=0, futureDays=0)
//      → 방금 종료된 매치의 status=FINISHED + 점수 즉시 갱신
//   2. runRecap() 호출 — 36시간 내 FINISHED + RECAP 없는 매치 글 발행
//
// 효과: 매치 종료 ~ RECAP 발행까지 평균 5분, 최악 10분 (기존 1시간 30분에서 단축)

import { NextResponse } from "next/server";
import { runCollect } from "@/jobs/collect";
import { runRecap } from "@/jobs/generate-articles";
import { prisma } from "@/lib/db";
import type { League } from "@/lib/sports/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  "KBO",
  "NPB",
  "LOL",
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
  const startedAt = Date.now();
  try {
    // 1. 오늘 매치만 가볍게 collect — 종료 status/score 즉시 반영
    await runCollect({
      leagues: ALL_LEAGUES,
      pastDays: 0,
      futureDays: 0,
    });
    // 2. 그 자리에서 RECAP 발행 시도 (이미 RECAP 있는 매치는 자동 skip)
    await runRecap();
    return NextResponse.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: (e as Error).message,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
