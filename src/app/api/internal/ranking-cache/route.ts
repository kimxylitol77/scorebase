// POST {kind, payload, pubTime} → RankingCache upsert. worker fifa-ranking-cron 전용.
// 인증: Authorization: Bearer ${INTERNAL_API_TOKEN}
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["fifa_men", "fifa_women", "club"]);

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.INTERNAL_API_TOKEN || auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { kind?: string; payload?: unknown; pubTime?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const { kind, payload, pubTime } = body;
  if (!kind || !KINDS.has(kind) || !Array.isArray(payload)) {
    return NextResponse.json({ error: "bad kind/payload" }, { status: 400 });
  }
  await prisma.rankingCache.upsert({
    where: { kind },
    create: { kind, payload: payload as object[], pubTime: pubTime ?? null },
    update: { payload: payload as object[], pubTime: pubTime ?? null },
  });
  return NextResponse.json({ ok: true, kind, count: payload.length });
}
