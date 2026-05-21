// GET /api/internal/live-matches-for-bot
// Mac mini worker (match-narrator, event-commentator) 가 호출할 라이브 매치 리스트.
// Bearer auth: INTERNAL_API_TOKEN.
//
// Query:
//   ?leagues=KBO,NPB,MLB  — 콤마구분. 미지정 시 야구 3리그.
//
// 응답 — 워커가 필요한 컨텍스트만 (DB Match.id + 한글 팀명 + 스코어 + 기존 코멘트).
// 자세한 라이브 상태 (이닝/상황/플레이) 는 워커 측에서 추가 API 호출로.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  const url = new URL(req.url);
  const leaguesParam = url.searchParams.get("leagues") ?? "KBO,NPB,MLB";
  const leagues = leaguesParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (leagues.length === 0) {
    return NextResponse.json({ error: "leagues required" }, { status: 400 });
  }

  const matches = await prisma.match.findMany({
    where: { league: { in: leagues }, status: "LIVE" },
    include: {
      homeTeam: { select: { name: true, shortName: true } },
      awayTeam: { select: { name: true, shortName: true } },
      liveCommentary: {
        select: { matchSummary: true, summaryAt: true, scoreSnapshot: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    matches: matches.map((m) => ({
      matchId: m.id,
      league: m.league,
      externalId: m.externalId,
      homeName: m.homeTeam.name,
      awayName: m.awayTeam.name,
      homeShort: m.homeTeam.shortName,
      awayShort: m.awayTeam.shortName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      startTime: m.startTime.toISOString(),
      // 기존 코멘트 (worker 가 TTL/stale 판단)
      lastSummary: m.liveCommentary?.matchSummary ?? null,
      lastSummaryAt: m.liveCommentary?.summaryAt?.toISOString() ?? null,
      lastScoreSnapshot: m.liveCommentary?.scoreSnapshot ?? null,
    })),
  });
}
