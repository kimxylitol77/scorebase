// POST /api/internal/consensus-pick
// 맥미니 consensus-crawler 가 Covers MLB 경기 1건씩 push → 매칭·한국어 분석·Post 생성.
// Bearer auth: env INTERNAL_API_TOKEN (다른 맥미니 봇과 동일 토큰).

import { NextRequest, NextResponse } from "next/server";
import { ingestConsensusGame, type ConsensusGame } from "@/lib/analysis/consensus-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function num(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const awayAbbr = String(body.awayAbbr ?? "").trim();
  const homeAbbr = String(body.homeAbbr ?? "").trim();
  const overPct = num(body.overPct);
  const underPct = num(body.underPct);
  const line = num(body.line);
  if (!awayAbbr || !homeAbbr || overPct == null || underPct == null || line == null) {
    return NextResponse.json(
      { error: "awayAbbr, homeAbbr, overPct, underPct, line required" },
      { status: 400 },
    );
  }

  const game: ConsensusGame = {
    awayAbbr,
    homeAbbr,
    overPct,
    underPct,
    line,
    overPicks: num(body.overPicks),
    underPicks: num(body.underPicks),
    gameTimeEt: body.gameTimeEt != null ? String(body.gameTimeEt) : null,
  };

  try {
    const result = await ingestConsensusGame(game);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ created: false, error: (e as Error).message }, { status: 500 });
  }
}
