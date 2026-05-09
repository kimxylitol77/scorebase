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
    await runCollect({ leagues: ALL_LEAGUES });
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
