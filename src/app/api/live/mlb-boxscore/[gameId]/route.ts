// /api/live/mlb-boxscore/[gameId] — 네이버 스타일 라인업 / 박스스코어 데이터.
// ESPN game id → MLB Stats schedule 매칭 → gamePk → boxscore.
// 라인업 + 타자/투수 게임 통계 + 시즌 통계 한방.
// Cache 30s (live), 5min (final/preview) — boxscore 가 라이브 동안 갱신됨.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchMlbFullBoxscore,
  findMlbGamePk,
  type MlbFullBoxscore,
} from "@/lib/sports/mlb-stats-api";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json({ error: "invalid game id" }, { status: 400 });
  }
  try {
    const match = await prisma.match.findFirst({
      where: { externalId: gameId, league: "MLB" },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match) {
      return NextResponse.json({ error: "match not found" }, { status: 404 });
    }
    const gamePk = await findMlbGamePk(
      match.startTime.toISOString(),
      match.homeTeam.name,
      match.awayTeam.name,
    );
    if (!gamePk) {
      return NextResponse.json(
        { error: "gamePk not found", boxscore: null },
        { status: 200 },
      );
    }
    const boxscore: MlbFullBoxscore | null = await fetchMlbFullBoxscore(gamePk);
    if (!boxscore) {
      return NextResponse.json(
        { error: "boxscore fetch failed", boxscore: null },
        { status: 200 },
      );
    }
    const isLive = match.status === "LIVE";
    const maxAge = isLive ? 30 : 300;
    return NextResponse.json(
      { boxscore, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
          "Vercel-CDN-Cache-Control": `max-age=${maxAge}`,
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, boxscore: null },
      { status: 200 },
    );
  }
}
