// GET /api/match-sim?matchId= — 단일 경기 5,000회 시뮬 (표시 확률 주사위 + 종목 엔진 스코어 분포)
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { simulateMatch } from "@/lib/predict/match-sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`match-sim:${ip}`, {
    max: 30,
    windowMs: 60_000,
    lockMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "too many requests" },
      { status: 429 },
    );
  }

  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json(
      { ok: false, error: "matchId 필요" },
      { status: 400 },
    );
  }

  const result = await simulateMatch(matchId);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
