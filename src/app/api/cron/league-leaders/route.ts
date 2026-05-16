// /api/cron/league-leaders — 시즌 리더보드 매일 갱신.
// vercel.json schedule: KST 05:00 (UTC 20:00 전날) 또는 별도.

import { NextResponse } from "next/server";
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
