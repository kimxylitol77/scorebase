// /api/cron/league-leaders — 시즌 리더보드 매일 갱신.
// vercel.json schedule: KST 05:00 (UTC 20:00 전날) 또는 별도.

import { NextResponse } from "next/server";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchLeagueLeaders } from "@/jobs/fetch-league-leaders";
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
  // ?sport=soccer|baseball|basketball|hockey|esports — 부분 처리 (Vercel 함수 한도 회피)
  const url = new URL(req.url);
  const sport = url.searchParams.get("sport") as
    | "soccer"
    | "baseball"
    | "basketball"
    | "hockey"
    | "esports"
    | null;
  try {
    const result = await runFetchLeagueLeaders({ sport: sport ?? undefined });
    // 종목별 격리로 부분 실패는 result.errors 로 올라옴 — 실패 있으면 ok:false 로 기록해 감시에 노출
    const errors = (result as { errors?: string[] }).errors;
    await recordCronRun(
      "league-leaders",
      errors?.length ? { ok: false, error: errors.join("; ") } : undefined,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // 실패도 실행 기록 — dead-man's switch 가 "미실행" 오탐 대신 "실행 실패" 로 알리게 (registry 의도)
    await recordCronRun("league-leaders", { ok: false, error: (e as Error).message });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
