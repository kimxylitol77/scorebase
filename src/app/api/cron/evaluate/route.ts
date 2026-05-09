import { NextResponse } from "next/server";
import { runEvaluate, runEvaluateMatches } from "@/jobs/evaluate-predictions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const [previewResult, matchResult] = await Promise.all([
      runEvaluate(),
      runEvaluateMatches(),
    ]);
    return NextResponse.json({
      ok: true,
      preview: previewResult,
      match: matchResult,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
