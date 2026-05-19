// POST /api/internal/thesports-cache
// Lightsail worker 가 TheSports football match data 를 캐시에 upsert.
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  matchId: number;        // 우리 Match.id
  tsMatchId: string;      // thesports match id
  detailLive?: unknown;
  lineup?: unknown;
  analysis?: unknown;
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

  if (typeof body.matchId !== "number" || typeof body.tsMatchId !== "string") {
    return NextResponse.json({ error: "matchId(number) + tsMatchId(string) required" }, { status: 400 });
  }

  // 우리 Match 존재 확인
  const exists = await prisma.match.findUnique({ where: { id: body.matchId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "match not found" }, { status: 404 });

  // upsert — 매치당 1 row
  // detailLive/lineup/analysis 는 undefined 면 갱신 안 함 (부분 update)
  const data: Record<string, unknown> = { tsMatchId: body.tsMatchId };
  if (body.detailLive !== undefined) data.detailLive = body.detailLive as object;
  if (body.lineup !== undefined) data.lineup = body.lineup as object;
  if (body.analysis !== undefined) data.analysis = body.analysis as object;

  const cache = await prisma.theSportsMatchCache.upsert({
    where: { matchId: body.matchId },
    create: {
      matchId: body.matchId,
      tsMatchId: body.tsMatchId,
      detailLive: (body.detailLive ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      lineup: (body.lineup ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      analysis: (body.analysis ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
    update: data,
    select: { id: true, matchId: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, cache });
}
