// POST /api/internal/consensus-pick
// 맥미니 consensus-crawler 의 2단계 호출을 받는다.
//  - phase 없음(기본): 매칭 — Covers 경기 1건을 scorebase Match 에 매칭 + dedup (LLM 없음).
//  - phase="save": 저장 — 크롤러가 로컬 Ollama 로 생성한 완성 분석을 Post 로 만든다.
// Bearer auth: env INTERNAL_API_TOKEN (다른 맥미니 봇과 동일 토큰).

import { NextRequest, NextResponse } from "next/server";
import {
  matchConsensusGame,
  saveConsensusPost,
  type ConsensusGame,
} from "@/lib/analysis/consensus-bot";

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

  // 2단계: 로컬 Ollama 가 생성한 완성 분석 저장
  if (body.phase === "save") {
    const matchId = num(body.matchId);
    const line = num(body.line);
    const pick = body.pick === "UNDER" ? "UNDER" : body.pick === "OVER" ? "OVER" : null;
    const title = String(body.title ?? "").trim().slice(0, 120);
    const analysis = String(body.analysis ?? "").trim();
    if (matchId == null || line == null || pick == null || !title || analysis.length < 20) {
      return NextResponse.json(
        { error: "matchId, line, pick(OVER|UNDER), title, analysis(>=20) required" },
        { status: 400 },
      );
    }
    try {
      const r = await saveConsensusPost({ matchId, pick, line, title, analysis });
      return NextResponse.json(r);
    } catch (e) {
      return NextResponse.json({ created: false, error: (e as Error).message }, { status: 500 });
    }
  }

  // 1단계: 매칭 + dedup (LLM 없음)
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
    const result = await matchConsensusGame(game);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ matched: false, error: (e as Error).message }, { status: 500 });
  }
}
