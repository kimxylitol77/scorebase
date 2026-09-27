// GET /api/internal/volleyball-matches-with-ts-mapping?days=2[&sport=hockey]
// Lightsail volleyball-poller 가 detail_live 의 ts match id → 우리 matchId 매핑하는 데 사용.
// 배구도 농구처럼 diary/detail_live 단일 id system — tsMatchId 로 바로 연결.
// 2026-09-03 — sport=hockey 면 하키 리그 집합으로 같은 매핑을 돌려준다(hockey-odds-poller 용).
// 하키 매치도 전부 ts 매핑이 있어(±14일 실측) 라우트를 새로 만들 이유가 없었다.
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HOCKEY_LEAGUES, VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";

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
  const leagues = req.nextUrl.searchParams.get("sport") === "hockey" ? HOCKEY_LEAGUES : VOLLEYBALL_LEAGUES;
  const now = Date.now();
  const from = new Date(now - days * 86400_000);
  const to = new Date(now + days * 86400_000);

  const rows = await prisma.match.findMany({
    where: {
      league: { in: [...leagues] },
      startTime: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
    },
    select: {
      id: true,
      externalId: true,
      status: true,
      theSportsCache: { select: { tsMatchId: true, detailLive: true } },
    },
  });

  // needsFinal — 종료됐는데 캐시가 종료 상태(status_id 100)가 아니거나 통계가 비었다. 폴러는 detail_live 목록에
  // 있는 동안만 저장해서 끝나기 직전 값에 멈추거나 통계가 비었다(아시안게임 여자 37경기 중 20경기만 통계, 2026-09-27).
  // 폴러가 이 경기들을 match/live/history 로 최종값을 받아 덮는다. 배구만(하키는 구조가 다르다).
  const isVolleyball = leagues === VOLLEYBALL_LEAGUES;
  const matches = rows
    .map((r) => {
      const tsMatchId =
        r.theSportsCache?.tsMatchId ??
        (r.externalId.startsWith("ts-") ? r.externalId.slice(3) : null);
      if (!tsMatchId) return null;
      const dl = r.theSportsCache?.detailLive as { score?: unknown[]; stats?: unknown[] } | null | undefined;
      const final = Array.isArray(dl?.score) && Number(dl!.score[1]) === 100;
      const hasStats = Array.isArray(dl?.stats) && dl!.stats.length > 0;
      const needsFinal = isVolleyball && r.status === "FINISHED" && (!final || !hasStats);
      return { matchId: r.id, tsMatchId, needsFinal };
    })
    .filter((m): m is { matchId: number; tsMatchId: string; needsFinal: boolean } => m !== null);

  return NextResponse.json({ count: matches.length, matches });
}
