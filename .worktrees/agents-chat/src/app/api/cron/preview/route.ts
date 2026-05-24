import { NextResponse } from "next/server";
import { runPreview } from "@/jobs/generate-previews";
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
  // ?league=EPL · ?horizonDays=2 · ?take=10 — 수동 trigger 시 잘게 처리.
  const league = url.searchParams.get("league") ?? undefined;
  const horizonDays = Number(url.searchParams.get("horizonDays")) || undefined;
  const take = Number(url.searchParams.get("take")) || undefined;
  try {
    await runPreview({ league, horizonDays, take });
    return NextResponse.json({ ok: true, league, horizonDays, take });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
