// POST /api/internal/bot-heartbeat
// 외부 워커 (Mac mini, Lightsail 등) 가 5분마다 ping.
// upsert lastAt=now(), notifiedAt=null (재시작 시 알림 reset).
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  name: string;             // 워커 식별자 — ex: "mac-mini-match-narrator"
  metadata?: Record<string, unknown>;
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
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name(string) required" }, { status: 400 });
  }

  const now = new Date();
  const metadataJson = (body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue;

  const row = await prisma.botHeartbeat.upsert({
    where: { name: body.name },
    create: {
      name: body.name,
      lastAt: now,
      metadata: metadataJson,
    },
    update: {
      lastAt: now,
      metadata: metadataJson,
      notifiedAt: null, // 재시작 → 다음 down 시 다시 알림 받도록 reset
    },
    select: { name: true, lastAt: true },
  });

  return NextResponse.json({ ok: true, row });
}
