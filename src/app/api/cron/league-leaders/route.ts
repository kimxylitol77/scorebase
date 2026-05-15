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
  try {
    const result = await runFetchLeagueLeaders();
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
