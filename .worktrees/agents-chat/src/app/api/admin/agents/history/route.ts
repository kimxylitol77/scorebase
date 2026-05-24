// /api/admin/agents/history?persona=... — 페르소나별 최근 대화 100개 (오래된 것 → 최신 순).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERSONAS, type PersonaKey } from "@/lib/agents/personas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const c = await cookies();
  if (!readSessionCookie(c.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const personaKey = url.searchParams.get("persona") as PersonaKey | null;
  const sessionId = url.searchParams.get("sessionId") || "default";
  if (!personaKey || !PERSONAS[personaKey]) {
    return NextResponse.json({ error: "invalid_persona" }, { status: 400 });
  }
  const rows = await prisma.agentMessage.findMany({
    where: { persona: personaKey, sessionId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, role: true, content: true, model: true, createdAt: true },
  });
  rows.reverse();
  return NextResponse.json({ messages: rows });
}
