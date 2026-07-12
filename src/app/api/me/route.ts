// 헤더 배지용 경량 세션 조회 — cookies() 를 route handler 로 격리해 페이지 ISR 을 지키기 위한 endpoint.
// (서버 컴포넌트 배지가 cookies() 를 부르면 레이아웃 트리 전체가 dynamic 강등 — 전 페이지 CDN MISS 회귀)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await cookies();
  const userSession = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  const adminSession = readSessionCookie(c.get(COOKIE_NAME)?.value);

  let nickname: string | null = null;
  if (userSession) {
    const user = await prisma.user.findUnique({
      where: { id: userSession.userId },
      select: { nickname: true },
    });
    nickname = user?.nickname ?? null;
  }

  return NextResponse.json(
    { nickname, admin: adminSession?.username ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
