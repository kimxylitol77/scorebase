// POST /api/internal/threads-posted
// 워커가 Threads 발행 성공 후 호출 → ThreadsPost 이력 기록(dedup 단일 진실).
// @@unique([kind, refKey]) 로 멱등 — 같은 콘텐츠 재호출해도 row 1개.
// Bearer auth: INTERNAL_API_TOKEN.
//
// Body: { kind: "DAILY_MATCHES" | "BLOG", refKey: string, threadsMediaId?: string, text?: string }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: {
    kind?: string;
    refKey?: string;
    threadsMediaId?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.kind || !body.refKey) {
    return NextResponse.json({ error: "kind/refKey required" }, { status: 400 });
  }

  const row = await prisma.threadsPost.upsert({
    where: { kind_refKey: { kind: body.kind, refKey: body.refKey } },
    create: {
      kind: body.kind,
      refKey: body.refKey,
      threadsMediaId: body.threadsMediaId ?? null,
      text: body.text ?? null,
    },
    update: {
      threadsMediaId: body.threadsMediaId ?? undefined,
      text: body.text ?? undefined,
      postedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, id: row.id });
}
