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
    select: { tsMatchId: true, matchId: true },
  });
  const mapping: Record<string, number> = {};
  for (const r of rows) {
    if (r.tsMatchId) mapping[r.tsMatchId] = r.matchId;
  }
  return NextResponse.json({ count: rows.length, mapping });
}
