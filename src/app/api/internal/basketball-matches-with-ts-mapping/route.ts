// GET /api/internal/basketball-matches-with-ts-mapping?days=2
// Lightsail basketball-poller 가 detail_live 의 ts match id → 우리 matchId 매핑하는 데 사용.
// 농구는 diary/season id === detail_live id (단일 id system) → tsMatchId 로 바로 연결.
// tsMatchId = cache.tsMatchId (기존 매치에 linked) 또는 externalId 의 "ts-" 제거값 (native ts 매치).
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { BASKETBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 2), 1), 7);
  const now = Date.now();
  const from = new Date(now - days * 86400_000);
  const to = new Date(now + days * 86400_000);

  const rows = await prisma.match.findMany({
    where: {
      league: { in: [...BASKETBALL_LEAGUES] },
      startTime: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    select: {
      id: true,
      externalId: true,
      theSportsCache: { select: { tsMatchId: true } },
    },
  });

  const matches = rows
    .map((r) => {
      const tsMatchId =
        r.theSportsCache?.tsMatchId ??
        (r.externalId.startsWith("ts-") ? r.externalId.slice(3) : null);
      return tsMatchId ? { matchId: r.id, tsMatchId } : null;
    })
    .filter((m): m is { matchId: number; tsMatchId: string } => m !== null);

  return NextResponse.json({ count: matches.length, matches });
}
