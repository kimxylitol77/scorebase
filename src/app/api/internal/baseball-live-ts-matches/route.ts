// GET /api/internal/baseball-live-ts-matches
// Lightsail baseball-odds-poller 가 odds/history 받을 매치 list 조회.
// 응답: baseball 리그 중 TheSportsMatchCache 가 있고 LIVE 또는 시작 임박 (시작 ±3h) 매치.
//
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // LIVE 매치 + 시작 ±3h scheduled (배당 변동은 시작 전부터 잡힘)
  const start = new Date(now.getTime() - 6 * 3600 * 1000);
  const end = new Date(now.getTime() + 3 * 3600 * 1000);

  const rows = await prisma.match.findMany({
    where: {
      league: { in: ["KBO", "NPB", "MLB"] },
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: start, lt: end },
      theSportsCache: { isNot: null },
    },
    select: {
      id: true,
      league: true,
      status: true,
      startTime: true,
      theSportsCache: { select: { tsMatchId: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const matches = rows
    .filter((r) => r.theSportsCache?.tsMatchId)
    .map((r) => ({
      matchId: r.id,
      tsMatchId: r.theSportsCache!.tsMatchId,
      league: r.league,
      status: r.status,
      startTime: r.startTime.toISOString(),
    }));

  return NextResponse.json({ count: matches.length, matches });
}
