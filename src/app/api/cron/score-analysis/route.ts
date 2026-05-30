// 분석 게시판 예측 자동 채점 cron.
// 경기 FINISHED 후 회원 픽을 실제 결과와 대조 → isCorrect 채우고 적중 시 경험치 지급.
// evaluate(모델 예측 채점)와 분리 — 기존 동작 무수정, 독립 실행.

import { NextResponse } from "next/server";
import { scoreAnalysisPredictions } from "@/lib/analysis/scoring";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await scoreAnalysisPredictions();
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
