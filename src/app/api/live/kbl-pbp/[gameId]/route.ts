// /api/live/kbl-pbp/[gameId] — KBL 문자중계(KBL 공식 text-cast 해독 + 누적 스코어). 경기 상세 "문자중계" 탭이 폴링한다.
// Cache: 경기 중 10초 s-maxage, 종료 후 1시간. 응답 ~60KB(600줄 안팎)라 점수 폴링과 분리했다.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { findKblGmkey, fetchKblPlays, KBL_TEAM_CODE } from "@/lib/sports/kbl-game";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const m = await prisma.match.findFirst({
    where: { league: "KBL", externalId: gameId },
    select: { status: true, startTime: true, homeTeamId: true, awayTeamId: true },
  });
  if (!m) return NextResponse.json({ error: "not found" }, { status: 404 });
  const live = m.status === "LIVE";
  const key = await findKblGmkey(m.startTime, m.homeTeamId, m.awayTeamId);
  const homeCode = KBL_TEAM_CODE[m.homeTeamId];
  const data = key && homeCode ? await fetchKblPlays(key.gmkey, homeCode, live) : null;
  const maxAge = live ? 10 : m.status === "FINISHED" ? 3600 : 60;
  return NextResponse.json(
    { status: m.status, plays: data?.plays ?? [], starters: data?.starters ?? { home: [], away: [] } },
    { headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` } },
  );
}
