// /api/admin/active — 관리자용 현재 접속자 수 (PageView 최근 N분 unique UA).
// admin 인증 cookie 검증. 봇 제외. 5분/1분 두 윈도우 반환.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { detectBot } from "@/lib/bot-detect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const last5 = new Date(now - 5 * 60 * 1000);

  // 최근 5분 PageView (1분 윈도우는 같은 응답에서 필터)
  const rows = await prisma.pageView.findMany({
    where: { ts: { gte: last5 } },
    select: { userAgent: true, ts: true },
    take: 10000,
  });

  const last1 = new Date(now - 60 * 1000);
  const humanUasFor = (since: Date) => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.ts < since) continue;
      if (detectBot(r.userAgent).isBot) continue;
      set.add(r.userAgent ?? "anon");
    }
    return set.size;
  };

  // PV (사람만)
  let pv5 = 0;
  let pv1 = 0;
  for (const r of rows) {
    if (detectBot(r.userAgent).isBot) continue;
    pv5++;
    if (r.ts >= last1) pv1++;
  }

  return NextResponse.json({
    active5m: humanUasFor(last5),
    active1m: humanUasFor(last1),
    pv5m: pv5,
    pv1m: pv1,
    fetchedAt: new Date().toISOString(),
  });
}
