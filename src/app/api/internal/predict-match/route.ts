// GET /api/internal/predict-match?id=<matchId>
// predictionEngine.predictMatchById wrapper — Mac mini narrator + /scores UI prerender 용.
// Bearer auth: INTERNAL_API_TOKEN.
//
// 동작:
//   1) predictMatchById(id) 호출
//   2) 결과를 Match.predHome/predDraw/predAway/predWinner 에 cache write
//      (UI 가 별도 호출 없이 page.tsx query 로 prediction 표시 가능)
//   3) NO_PICK 이면 predWinner=null 로 저장 (UI 가 "추천 없음" 분기)
//   4) 응답으로 PredictionResult 전체 (reasons / confidence / signalsUsed 포함) 반환
//
// 응답: { ok: true, prediction: PredictionResult | null }

import { NextRequest, NextResponse } from "next/server";
import { predictMatchById } from "@/lib/predictionEngine";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) return unauthorized();

  const url = new URL(req.url);
  const idParam = url.searchParams.get("id");
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id required (positive integer)" }, { status: 400 });
  }

  try {
    const prediction = await predictMatchById(id);
    if (prediction) {
      // Match 에 cache — UI / cron 평가가 별도 호출 없이 사용.
      // predCorrect 는 evaluate-predictions cron 이 매치 종료 후 채움 — 여기선 건드리지 않음.
      try {
        await prisma.match.update({
          where: { id },
          data: {
            predHome: prediction.probHome,
            predDraw: prediction.probDraw,
            predAway: prediction.probAway,
            predWinner: prediction.pick === "NO_PICK" ? null : prediction.pick,
          },
        });
      } catch (e) {
        // FK 오류 등 silent — prediction 응답은 그대로
        console.warn(`[predict-match] cache write fail id=${id}:`, (e as Error).message);
      }
    }
    return NextResponse.json({ ok: true, prediction });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
