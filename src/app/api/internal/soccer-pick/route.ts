// POST /api/internal/soccer-pick
// 맥미니 soccer-pickster-crawler 의 2단계 호출을 받는다.
//  - phase 없음(기본): 매칭 — 해외 축구 컨센서스 1건을 scorebase Match 에 매칭 + dedup (LLM 없음).
//  - phase="save": 저장 — 크롤러가 로컬 Ollama 로 생성한 완성 분석을 Post 로 만든다.
// Bearer auth: env INTERNAL_API_TOKEN (다른 맥미니 봇과 동일 토큰).

import { NextRequest, NextResponse } from "next/server";
import {
  matchSoccerPick,
  saveSoccerPickPost,
  type SoccerPickGame,
} from "@/lib/analysis/soccer-pickster-bot";

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
    const pick =
      body.pick === "HOME" || body.pick === "DRAW" || body.pick === "AWAY" ? body.pick : null;
    const title = String(body.title ?? "").trim().slice(0, 120);
    const analysis = String(body.analysis ?? "").trim();
    if (matchId == null || pick == null || !title || analysis.length < 20) {
      return NextResponse.json(
        { error: "matchId, pick(HOME|DRAW|AWAY), title, analysis(>=20) required" },
        { status: 400 },
      );
    }
    try {
      const r = await saveSoccerPickPost({ matchId, pick, title, analysis });
      return NextResponse.json(r);
    } catch (e) {
      return NextResponse.json({ created: false, error: (e as Error).message }, { status: 500 });
    }
  }

  // 1단계: 매칭 + dedup (LLM 없음)
  const league = String(body.league ?? "").trim();
  const homeName = String(body.homeName ?? "").trim();
  const awayName = String(body.awayName ?? "").trim();
  const selection = String(body.selection ?? "").trim();
  const kickoffIso = String(body.kickoffIso ?? "").trim();
  const confidencePct = num(body.confidencePct);
  if (!league || !homeName || !awayName || !selection || !kickoffIso || confidencePct == null) {
    return NextResponse.json(
      { error: "league, homeName, awayName, selection, kickoffIso, confidencePct required" },
      { status: 400 },
    );
  }

  const game: SoccerPickGame = {
    league,
    homeName,
    awayName,
    selection,
    kickoffIso,
    confidencePct,
    tipsFor: num(body.tipsFor),
    tipsTotal: num(body.tipsTotal),
    odds: num(body.odds),
  };

  try {
    const result = await matchSoccerPick(game);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ matched: false, error: (e as Error).message }, { status: 500 });
  }
}
