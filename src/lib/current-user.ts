// 현재 로그인한 방문자(회원) 조회 — 서버 컴포넌트/서버액션 공용.
// UserBadge 의 인라인 패턴(cookies → readUserSessionCookie → findUnique)을 함수로 추출.
// admin(src/lib/auth.ts) 과 무관 — user_session 쿠키만 본다.

import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";

export interface CurrentUser {
  id: string;
  nickname: string;
  email: string;
  exp: number;
  points: number;
  level: number;
}

/** 현재 로그인 회원. 비로그인/세션무효/유저삭제 시 null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      nickname: true,
      email: true,
      exp: true,
      points: true,
      level: true,
    },
  });
  return user;
}

/** userId 만 필요할 때 — DB 조회 없이 세션 서명만 검증. */
export async function getCurrentUserId(): Promise<string | null> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  return session?.userId ?? null;
}
