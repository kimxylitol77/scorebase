import { NextResponse } from "next/server";
import { runEvaluate, runEvaluateMatches, runBrierReport } from "@/jobs/evaluate-predictions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// take 200→400 (desc 백로그 배수)로 처리량 늘어 60s 부족 가능 → 180s.
export const maxDuration = 180;

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
    // Brier 리포트 — predCorrect 채운 뒤 실행 (확률 품질 + 시장 대비, cron 로그·응답으로 확인)
    const brier = await runBrierReport().catch(() => null);
    return NextResponse.json({
      ok: true,
      preview: previewResult,
      match: matchResult,
      brier,
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
