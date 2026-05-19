// POST /api/internal/thesports-standings
// Lightsail worker 가 TheSports season/recent/table/detail 결과를 league별로 캐시.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// Body:
//   { league: string, tsSeasonId: string, payload: { promotions, tables } }
//
// Vercel serverless IP 는 ts whitelist 미포함이라 page server-side fetch 불가 →
// 이 endpoint 를 통해 worker 가 push, 페이지는 DB cache 조회.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  league: string;
  tsSeasonId: string;
  payload: { promotions?: unknown; tables?: unknown };
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.league !== "string" || typeof body.tsSeasonId !== "string" || !body.payload) {
    return NextResponse.json({ error: "league(string) + tsSeasonId(string) + payload required" }, { status: 400 });
  }
  if (!Array.isArray((body.payload as { tables?: unknown[] }).tables)) {
    return NextResponse.json({ error: "payload.tables array required" }, { status: 400 });
  }

  const cache = await prisma.theSportsStandingsCache.upsert({
    where: { league: body.league },
    create: {
      league: body.league,
      tsSeasonId: body.tsSeasonId,
      payload: body.payload as object,
    },
    update: {
      tsSeasonId: body.tsSeasonId,
      payload: body.payload as object,
    },
    select: { league: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, cache });
}
