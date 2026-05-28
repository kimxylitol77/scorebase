import { NextResponse, type NextRequest } from "next/server";

// /admin 경로 보호 — cookie 존재만 체크 (검증은 page/action 에서).
// /admin/login 은 누구나 접근 가능.

const COOKIE_NAME = "admin_session";

// 스코어보드.kr — 라이브 스코어 전용 도메인. scorebase 와 같은 Vercel 앱을 공유하되
// host 로 분기해 루트 접속 시 /scores 화면을 보여준다 (URL 은 스코어보드.kr 유지).
// 한글 도메인은 브라우저가 punycode(xn--) 로 host 헤더 전송 → 둘 다 매칭.
const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq.kr"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 스코어보드.kr 루트 → /scores 내용으로 rewrite (scorebase.kr 은 영향 없음).
  if (path === "/") {
    const host = (req.headers.get("host") || "").toLowerCase();
    if (SCOREBOARD_HOSTS.some((h) => host.includes(h))) {
      const url = req.nextUrl.clone();
      url.pathname = "/scores";
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

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
  matcher: ["/admin/:path*", "/"],
};
