import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

// 클라이언트가 페이지 진입 시 호출. /admin 영역은 트래킹 제외.

const MAX_PATH = 200;
const MAX_HEADER = 200;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path : "";
    if (!path || path.startsWith("/admin") || path.startsWith("/api")) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    // sessionId — 클라이언트 localStorage 의 random ID. unique 방문자 카운트 용.
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.length <= 64
        ? body.sessionId
        : null;

    const h = await headers();
    await prisma.pageView.create({
      data: {
        path: path.slice(0, MAX_PATH),
        userAgent: h.get("user-agent")?.slice(0, MAX_HEADER) ?? null,
        referrer: h.get("referer")?.slice(0, MAX_HEADER) ?? null,
        // 접속 도메인 — scorebase.kr vs 스코어보드.kr 분리용. 트랙 요청이 해당
        // 도메인으로 오므로 Host 헤더에 그대로 잡힘(스코어보드.kr 은 punycode).
        host: h.get("host")?.slice(0, MAX_HEADER) ?? null,
        sessionId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
