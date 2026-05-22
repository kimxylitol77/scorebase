// GET /api/internal/ts-baseball-mapping
// Lightsail baseball-ws-subscriber 가 MQTT 메시지의 ts match id → 우리 Match.id 매핑 시 사용.
// TheSportsMatchCache 에 이미 누적된 매핑을 일괄 반환 (baseball-poller 가 채움).
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

  const rows = await prisma.theSportsMatchCache.findMany({
    where: { match: { league: { in: ["KBO", "NPB", "MLB"] } } },
    select: { tsMatchId: true, matchId: true },
  });
  const mapping: Record<string, number> = {};
  for (const r of rows) {
    if (r.tsMatchId) mapping[r.tsMatchId] = r.matchId;
  }
  return NextResponse.json({ count: rows.length, mapping });
}
