// /api/live/wkbl-pbp/[gameId] — WKBL 문자중계(공식 사이트 쿼터별 XML, 장면별 스코어). 경기 상세 "문자중계" 탭이 폴링한다(KBL 과 같은 모양).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { findWkblGame, fetchWkblPlays } from "@/lib/sports/wkbl-game";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const m = await prisma.match.findFirst({
    where: { league: "WKBL", externalId: gameId },
    select: { status: true, startTime: true, homeTeamId: true, awayTeamId: true },
  });
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = m.status === "LIVE";
  const g = await findWkblGame(m.startTime, m.homeTeamId, m.awayTeamId);
  const plays = g ? await fetchWkblPlays(g, live) : [];
  const maxAge = live ? 10 : m.status === "FINISHED" ? 3600 : 60;
  return NextResponse.json(
    { status: m.status, plays, starters: { home: [], away: [] } },
    { headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` } },
  );
}
