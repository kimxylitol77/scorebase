// admin 인증 가드 — server component / server action 전용.
// auth.ts(순수 crypto)와 분리: 여기서만 next/headers·next/navigation 을 끌어와
// client 번들(AdminBadge 등이 auth.ts 의 COOKIE_NAME 만 import)에 server API 가 새지 않게 한다.

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, readSessionCookie, type Session } from "@/lib/auth";

/**
 * admin 세션 필수. 쿠키 서명(HMAC)까지 검증해 무효이면 /admin/login 으로 redirect.
 * middleware 는 Edge 라 쿠키 "존재"만 보므로, 실제 차단은 반드시 이 함수로 한다.
 */
export async function requireAdmin(): Promise<Session> {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);
  if (!session) redirect("/admin/login");
  return session;
}
