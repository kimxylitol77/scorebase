import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { isInternalReferrerHost } from "@/lib/referrer-channel";

// 클라이언트가 페이지 진입 시 호출. /admin 영역은 트래킹 제외.

const MAX_PATH = 200;
const MAX_HEADER = 200;

/** 클라이언트가 보낸 document.referrer 정제 — 자기 도메인(내부 이동)·잡음 제거.
 *  2026-06-11 이전엔 track fetch 의 Referer 헤더(= 항상 우리 페이지 자신)를 저장해
 *  유입 분석이 불가능했음 → 랜딩 PV 의 document.referrer 만 의미 있는 값으로 저장. */
function cleanReferrer(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (isInternalReferrerHost(u.hostname)) return null; // 자기 도메인 = 내부 이동
    return raw.slice(0, MAX_HEADER);
  } catch {
    return null;
  }
}

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
    const isLanding = body.isLanding === true;
    // utm_source — 영숫자·하이픈·언더스코어·점만 허용 (저장 전 정규화).
    const utmSource =
      isLanding && typeof body.utmSource === "string" && body.utmSource
        ? body.utmSource.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64) || null
        : null;

    const h = await headers();
    await prisma.pageView.create({
      data: {
        path: path.slice(0, MAX_PATH),
        userAgent: h.get("user-agent")?.slice(0, MAX_HEADER) ?? null,
        // 유입 출처 — 랜딩 PV 의 document.referrer (외부 도메인만). 내부 이동은 null.
        referrer: isLanding ? cleanReferrer(body.referrer) : null,
        isLanding,
        utmSource,
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
