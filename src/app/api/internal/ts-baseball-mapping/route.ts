// GET /api/internal/ts-baseball-mapping
// Lightsail baseball-ws-subscriber 가 MQTT 메시지의 ts match id → 우리 Match.id 매핑 시 사용.
// TheSportsMatchCache 에 이미 누적된 매핑을 일괄 반환 (baseball-poller 가 채움).
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== expected) return unauthorized();

  // baseball 리그 단일 출처 — sport-leagues.ts (KBO/NPB/MLB + 9개 확장)
  const baseballLeagues = SPORTS.find((s) => s.code === "baseball")?.leagues ?? [];
  const rows = await prisma.theSportsMatchCache.findMany({
    where: { match: { league: { in: baseballLeagues } } },
    select: { tsMatchId: true, matchId: true, detailLive: true },
  });
  // swap 플래그는 baseball-poller 가 cache.detailLive._swap 에 합성한 값.
  // ws-subscriber 가 raw ft=[ts_away,ts_home] 를 우리 home/away 관점으로 변환하는 데 사용.
  const mapping: Record<string, { matchId: number; swap: boolean }> = {};
  for (const r of rows) {
    if (!r.tsMatchId) continue;
    const dl = r.detailLive as { _swap?: boolean } | null;
    mapping[r.tsMatchId] = { matchId: r.matchId, swap: dl?._swap === true };
  }
  return NextResponse.json({ count: rows.length, mapping });
}
