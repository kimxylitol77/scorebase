import { NextResponse, type NextRequest } from "next/server";

// /admin 경로 보호 — cookie 존재만 체크 (검증은 page/action 에서).
// /admin/login 은 누구나 접근 가능.

const COOKIE_NAME = "admin_session";

// 스코어보드.kr — 라이브 스코어 전용 도메인. scorebase 와 같은 Vercel 앱을 공유하되
// host 로 분기해 루트 접속 시 /scores 화면을 보여준다 (URL 은 스코어보드.kr 유지).
// 한글 도메인은 브라우저가 punycode(xn--) 로 host 헤더 전송 → 둘 다 매칭. www. 도 includes 로 커버.
const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq.kr"];

// 스코어베이스.com — 브랜드 랜딩 전용 도메인. 같은 Vercel 앱 공유, 루트 접속 시 /landing 화면.
// 한글 도메인은 브라우저가 punycode(xn--) host 헤더로 전송 → 둘 다 매칭.
const SCOREBASE_COM_HOSTS = ["스코어베이스.com", "xn--9k3b13iba842abwcsvs.com"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = (req.headers.get("host") || "").toLowerCase();
  const isScoreboard = SCOREBOARD_HOSTS.some((h) => host.includes(h));
  const isScoreBaseCom = SCOREBASE_COM_HOSTS.some((h) => host.includes(h));

  // 스코어보드.kr — scorebase.kr 와 콘텐츠가 동일해 구글 중복 색인을 막기 위해 전 경로 noindex.
  // robots.txt 는 크롤 허용 상태라 구글이 이 헤더를 읽고 색인에서 제외한다 (Disallow 면 헤더를 못 읽음).
  // 루트는 /scores 내용으로 rewrite (URL 은 스코어보드.kr 유지).
  // ── /admin 보호 (host 무관) — 미인증이면 로그인으로 redirect ──
  if (
    path.startsWith("/admin") &&
    path !== "/admin/login" &&
    path !== "/admin/logout"
  ) {
    const session = req.cookies.get(COOKIE_NAME);
    if (!session?.value) {
      const url = new URL("/admin/login", req.url);
      url.searchParams.set("from", path);
      return NextResponse.redirect(url);
    }
  }

  // ── 응답 + host별 헤더 ──
  // 스코어보드.kr 루트 → /scores 내용으로 rewrite (URL 은 스코어보드.kr 유지).
  // layout 등 server component 가 현재 경로를 알도록 주입 (admin 가드의 login 예외 판정에 사용).
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-pathname", path);

  let res: NextResponse;
  if (isScoreboard && path === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/scores";
    res = NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  } else if (isScoreBaseCom && path === "/") {
    // 스코어베이스.com 루트 → 랜딩(/landing) 내용으로 rewrite (URL 은 스코어베이스.com 유지).
    const url = req.nextUrl.clone();
    url.pathname = "/landing";
    res = NextResponse.rewrite(url, { request: { headers: reqHeaders } });
  } else {
    res = NextResponse.next({ request: { headers: reqHeaders } });
  }

  if (isScoreboard) {
    // 중복 색인 방지(noindex). X-Frame-Options 는 안 붙여 iframe 위젯 임베드 허용(어디서나).
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  } else {
    // scorebase.kr — 클릭재킹 방지 (next.config 전역 대신 host별로 여기서 부여).
    res.headers.set("X-Frame-Options", "DENY");
  }
  return res;
}

export const config = {
  // 정적 자산 제외한 전 경로 — 스코어보드.kr noindex 헤더를 모든 페이지에 적용하기 위함.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
