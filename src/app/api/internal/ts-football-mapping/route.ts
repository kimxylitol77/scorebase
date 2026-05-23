// GET /api/internal/ts-football-mapping
// Lightsail football-fast-poller 가 MQTT/REST 메시지의 ts match id → 우리 Match.id
// 매핑 시 사용. TheSportsMatchCache 의 축구 매치만 반환 (baseball 은 ts-baseball-mapping).
//
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// 축구 외 리그 — 매핑에서 제외 (야구·농구·하키·e스포츠)
const NON_SOCCER = [
  "KBO", "NPB", "MLB",
  "NBA", "WNBA", "NHL", "LOL",
];

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== expected) return unauthorized();

  const rows = await prisma.theSportsMatchCache.findMany({
    where: { match: { league: { notIn: NON_SOCCER } } },
    select: { tsMatchId: true, matchId: true },
  });
  const mapping: Record<string, number> = {};
  for (const r of rows) {
    if (r.tsMatchId) mapping[r.tsMatchId] = r.matchId;
  }
  return NextResponse.json({ count: rows.length, mapping });
}
