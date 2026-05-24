import { NextResponse, type NextRequest } from "next/server";

// /admin 경로 보호 — cookie 존재만 체크 (검증은 page/action 에서).
// /admin/login 은 누구나 접근 가능.

const COOKIE_NAME = "admin_session";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/admin")) return NextResponse.next();

  // 로그인 페이지는 통과
  if (path === "/admin/login" || path === "/admin/logout") {
    return NextResponse.next();
  }

  const session = req.cookies.get(COOKIE_NAME);
  if (!session?.value) {
    const url = new URL("/admin/login", req.url);
    url.searchParams.set("from", path);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
