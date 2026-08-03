// GET /api/internal/football-half-missing?days=3&limit=400
// 워커 half-backfill 이 "전반통계가 비어 있는 종료 매치" 목록을 받아가는 endpoint.
//
// 왜 필요한가. football-poller 는 SCHEDULED|LIVE 매치만 순회하고 한 cycle 에 20건만
// 처리한다. 동시 진행이 20건을 넘으면 뒤쪽 매치는 순번을 못 받고, 그 사이 종료되면
// 목록에서 빠져 halfTeamStats 를 영영 못 채운다 (2026-08-03 실측: 최근 30일 1,106건,
// 표본 30건 전부 ts 에는 데이터가 있었다). 종료 후 uuid 로 다시 긁는 경로가 필요하다.
//
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports/sport-leagues";

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

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, parseInt(url.searchParams.get("days") ?? "3", 10)));
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "400", 10)));

  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;

  const rows = await prisma.theSportsMatchCache.findMany({
    where: {
      // AnyNull — 컬럼이 SQL NULL 인 것과 JSON null 이 박힌 것 둘 다 잡는다.
      // 워커가 half 없이 push 하면 JSON null 로 저장돼 DbNull 필터로는 안 걸린다
      // (2026-08-03 실측 축구 30일: SQL NULL 179 vs JSON null 1,106).
      halfTeamStats: { equals: Prisma.AnyNull },
      match: {
        league: { in: soccerLeagues },
        status: "FINISHED",
        startTime: { gte: new Date(Date.now() - days * 24 * 3600 * 1000) },
      },
    },
    select: { matchId: true, tsMatchId: true, match: { select: { league: true, startTime: true } } },
    orderBy: { match: { startTime: "desc" } },
    take: limit,
  });

  const matches = rows
    .filter((r) => r.tsMatchId)
    .map((r) => ({ matchId: r.matchId, league: r.match.league, tsMatchId: r.tsMatchId }));

  return NextResponse.json({ count: matches.length, matches });
}
