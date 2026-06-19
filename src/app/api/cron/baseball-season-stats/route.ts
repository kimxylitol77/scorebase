// /api/cron/baseball-season-stats — 야구 팀/선수 시즌 누적 성적 매일 갱신.
// 경기 전 분석 섹션(팀 시즌 비교 / 타자 전력)의 데이터 소스.
// ?league=MLB|KBO|NPB — 부분 처리 (Vercel 함수 한도 회피용, 생략 시 3개 전부).

import { NextResponse } from "next/server";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchBaseballSeasonStats } from "@/jobs/fetch-baseball-season-stats";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const url = new URL(req.url);
  const league = url.searchParams.get("league") as "MLB" | "KBO" | "NPB" | null;
  try {
    const result = await runFetchBaseballSeasonStats({
      league: league ?? undefined,
    });
    await recordCronRun("baseball-season-stats");
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
