import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { detectBot } from "@/lib/bot-detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const VALID_VISIBILITY = new Set(["visible", "hidden"]);
const VALID_SECTION = new Set(["scores", "live", "other"]);

export async function POST(req: Request) {
  try {
    const h = await headers();
    // 렌더링 봇(AhrefsBot·Baiduspider-render 등)이 JS 를 실행해 heartbeat 를 그대로 보낸다.
    // 조회 시점에도 걸러지지만, 저장까지 하면 write 의 대부분이 버려질 행이 된다
    // (실측 2026-07-31: 전체 148행 중 119행이 봇). 저장 자체를 막는다.
    if (detectBot(h.get("user-agent")).isBot) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown";
    const limit = rateLimit(`presence:${ip}`, {
      max: 60,
      windowMs: 60_000,
      lockMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => null)) as {
      sessionId?: unknown;
      tabId?: unknown;
      path?: unknown;
      visibility?: unknown;
      section?: unknown;
    } | null;
    if (
      !body ||
      typeof body.sessionId !== "string" ||
      typeof body.tabId !== "string" ||
      !ID_RE.test(body.sessionId) ||
      !ID_RE.test(body.tabId) ||
      typeof body.path !== "string" ||
      !body.path.startsWith("/") ||
      body.path.length > 240 ||
      /[\u0000-\u001f<>'"`\\]/.test(body.path) ||
      typeof body.visibility !== "string" ||
      !VALID_VISIBILITY.has(body.visibility) ||
      typeof body.section !== "string" ||
      !VALID_SECTION.has(body.section)
    ) {
      return NextResponse.json(
        { ok: false, error: "invalid_request" },
        { status: 400 },
      );
    }
    if (body.path.startsWith("/admin") || body.path.startsWith("/api")) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const now = new Date();
    await prisma.activePresence.upsert({
      where: { tabId: body.tabId },
      create: {
        tabId: body.tabId,
        sessionId: body.sessionId,
        path: body.path,
        visibility: body.visibility,
        section: body.section,
        host: h.get("host")?.slice(0, 200) ?? null,
        userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
        lastSeenAt: now,
      },
      update: {
        sessionId: body.sessionId,
        path: body.path,
        visibility: body.visibility,
        section: body.section,
        host: h.get("host")?.slice(0, 200) ?? null,
        userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
        lastSeenAt: now,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
