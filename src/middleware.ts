import { NextResponse, type NextRequest } from "next/server";
import { detectBot } from "@/lib/bot-detect";
import { rateLimit } from "@/lib/rate-limit";

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

  // ── Rate limit — 단일 IP 의 공격적 스크래핑 속도 제한 ──
  // 검색·SNS·모니터 봇 + AI 검색·인용봇(aiSearch)은 면제 — SEO 색인·공유 미리보기·헬스체크 +
  // GEO(ChatGPT·Perplexity·Claude 등 AI 답변 인용) 색인 보호. 인덱싱 버스트가 429 로 막히면 인용 손실.
  // AI 학습봇(GPTBot·CCBot 등)은 robots 차단 + 여기서도 미면제(robots 무시 시 rate limit).
  const bot = detectBot(req.headers.get("user-agent"));
  const exemptFromLimit =
    // 라인업 캡처용 이미지 프록시는 정적 성격(한 보드에 11~22장) — rate limit 면제.
    path.startsWith("/api/lineup/img") ||
    (bot.isBot &&
      (bot.category === "search" ||
        bot.category === "social" ||
        bot.category === "monitor" ||
        bot.aiSearch === true));
  if (!exemptFromLimit) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { allowed, retryAfterSec } = rateLimit(`scrape:${ip}`, {
      max: 200, // 60초당 200요청 — 정상 브라우징+prefetch 여유, 스크래퍼만 초과
      windowMs: 60_000,
      lockMs: 60_000, // 초과 시 1분 차단
    });
    if (!allowed) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      });
    }
  }

  // ── /live/{league} 대소문자 정규화 — canonical·내부링크는 대문자인데 소문자 URL 이
  // 구 sitemap 으로 색인돼 랭킹 신호가 갈림(2026-07-05 Bing 실측) → 대문자 308 영구 redirect.
  // mlb·kbo·npb·lol·ufc 는 소문자 전용 라우트라 제외.
  const liveSeg = path.match(/^\/live\/([^/]+)\/(.+)$/);
  if (liveSeg) {
    const seg = liveSeg[1];
    const upper = seg.toUpperCase();
    if (seg !== upper && !["mlb", "kbo", "npb", "lol", "ufc"].includes(seg)) {
      const url = req.nextUrl.clone();
      url.pathname = `/live/${upper}/${liveSeg[2]}`;
      return NextResponse.redirect(url, 308);
    }
  }

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
  } else if (!path.startsWith("/embed")) {
    // scorebase.kr — 클릭재킹 방지 (next.config 전역 대신 host별로 여기서 부여).
    // /embed/* 는 외부 블로그에 iframe 으로 붙는 위젯이라 X-Frame-Options 미부여(어디서나 임베드 허용).
    res.headers.set("X-Frame-Options", "DENY");
  }
  return res;
}

export const config = {
  // 정적 자산 제외한 전 경로 — 스코어보드.kr noindex 헤더를 모든 페이지에 적용하기 위함.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
