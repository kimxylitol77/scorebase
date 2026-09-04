import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import ScoreboardHeader from "@/components/ScoreboardHeader";
import Footer from "@/components/Footer";
import LiveScoresBar from "@/components/LiveScoresBar";
import SiteChromeHeader from "@/components/SiteChromeHeader";
import SiteChromeFooter from "@/components/SiteChromeFooter";
import EnHeader from "@/components/en/EnHeader";
import EnFooter from "@/components/en/EnFooter";
import PageViewTracker from "@/components/PageViewTracker";
import PresenceTracker from "@/components/PresenceTracker";
import EmbedAuthLinks from "@/components/EmbedAuthLinks";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site-url";
import Chatbot from "@/components/Chatbot";
import LivePipScore from "@/components/LivePipScore";
import EmbedHidden from "@/components/EmbedHidden";
import ResponsiveGuard from "@/components/ResponsiveGuard";

// 한글 콘텐츠가 메인이므로 본문 sans 는 Pretendard 를 우선.
// 영문 코드/숫자는 Geist Mono 를 보조 폰트로.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    // 한글 브랜드를 타이틀 맨 앞에 — "스코어베이스" 검색·AI 답변에서 정체성 신호 (GEO Brand 병목 대응)
    default: "스코어베이스 (Scorebase) — EPL · NBA · MLB 라이브스코어·AI 데이터 분석 미디어",
    template: "%s | Scorebase",
  },
  description:
    "스코어베이스(Scorebase)는 EPL · NBA · NHL · MLB 등 글로벌 스포츠의 라이브스코어와 AI 경기 예측을 제공하는 데이터 분석 미디어입니다. 시즌 순위, Elo 레이팅, 공격·수비 랭킹, 최근 흐름과 H2H 상대 전적까지 데이터 기반으로 정리.",
  metadataBase: new URL(SITE_URL),
  // ⚠️ 여기에 사이트 공통 alternates.canonical 을 두면 안 된다 — Next metadata 상속으로
  // 자체 canonical 없는 모든 페이지가 "홈의 중복"을 선언하게 돼 색인에서 제외된다
  // (2026-05 노출 절벽 진단에서 확인). canonical 은 각 page 의 metadata 에서만.
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Scorebase",
    url: SITE_URL,
    title: "스코어베이스 (Scorebase) — 데이터로 보는 글로벌 스포츠",
    description:
      "EPL · NBA · NHL · MLB 의 경기 결과·프리뷰·시즌 시뮬레이션. Elo 레이팅과 통계 기반 인사이트.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "스코어베이스 — AI가 매일 분석하는 EPL · NBA · MLB · NHL 데이터",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scorebase",
    description:
      "데이터로 보는 EPL · NBA · NHL · MLB. 시즌 순위·Elo·승률 추정·시즌 시뮬레이션.",
    images: ["/og-image.png"],
  },
  keywords: [
    "스코어베이스", "Scorebase",
    "EPL", "프리미어리그", "라리가", "분데스리가", "세리에 A", "리그 1", "MLS",
    "챔피언스리그", "NBA", "MLB", "NHL",
    "스포츠 분석", "경기 결과", "경기 프리뷰",
    "Elo 레이팅", "승률 예측", "시즌 시뮬레이션",
    "축구 분석", "야구 분석", "농구 분석",
  ],
  category: "sports",
  manifest: "/manifest.webmanifest",
  verification: {
    google: "nuEkKWM8rmQBDts0NCa_z0KwY6Nc0-N2Tq5xpYUeUdg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // theme(다크모드)·host(도메인) 분기는 layout 에서 제거 — dynamic API(cookies/headers)를 쓰면
  // 전체 페이지가 dynamic 으로 강제돼 ISR(엣지 캐시) 불가했음. 둘 다 클라이언트로 이전:
  //   theme = <head> 블로킹 스크립트(아래)가 cookie>localStorage>OS 로 paint 전 html 에 적용(FOUC 없음).
  //   host  = SiteChromeHeader/Footer 가 hostname 으로 헤더·푸터 분기(메인은 SSR=CSR 동일).
  // SSR 은 기본 dark 로 고정 렌더 → 블로킹 스크립트가 light 사용자만 보정.
  return (
    <html
      lang="ko"
      className={`dark ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#0a0a0a", color: "#ededed", colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        {/* cookie 없는 첫 방문자 대응: localStorage 의 theme 또는 OS prefers-color-scheme 따라
            cookie 동기화 (다음 새로고침부터 SSR 가 cookie 인식). 동시에 첫 paint 도 맞춤. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var host=(location.hostname||'').toLowerCase();var sb=host.indexOf('스코어보드')>=0||host.indexOf('xn--hy1bm7m1yevrd8pq')>=0;var c=document.cookie.match(/(?:^|; )theme=([^;]+)/);var t=c?c[1]:localStorage.getItem('theme');var wantLight=sb||t==='light'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);if(!c&&!sb){document.cookie='theme='+(wantLight?'light':'dark')+'; path=/; max-age=31536000; SameSite=Lax';}var h=document.documentElement;if(wantLight){h.classList.remove('dark');h.style.backgroundColor='#ffffff';h.style.color='#0a0a0a';h.style.colorScheme='light';}else{h.classList.add('dark');h.style.backgroundColor='#0a0a0a';h.style.color='#ededed';h.style.colorScheme='dark';}}catch(e){}})();`,
          }}
        />
        {/* Google Tag Manager + GA4 gtag.js — production 만 (dev/local 트래픽 제외).
            주의: GTM 안에서 G-0KRD0WVQNC GA4 Configuration Tag 를 publish 하지 말 것
            (gtag.js 와 중복 측정 → 페이지뷰 2배). gtag.js 단독으로 GA4 트래킹. */}
        {process.env.NODE_ENV === "production" && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-WC48R8J8');`,
              }}
            />
            <script async src="https://www.googletagmanager.com/gtag/js?id=G-0KRD0WVQNC" />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-0KRD0WVQNC');`,
              }}
            />
          </>
        )}
        {/* Pretendard — 한국어 본문에 최적화된 변폭 폰트.
            preconnect 로 CSS·woff2 왕복의 TLS 핸드셰이크 선행(감사 B4 즉효약 — 근본책은 next/font/local 셀프호스팅). */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 블로그 RSS — 네이버 서치어드바이저 RSS 제출·피드 리더 자동 발견용.
            metadata.alternates 대신 직접 link 태그 — 하위 라우트 alternates 상속 오염 회피(31행 주석 참고). */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title="스코어베이스 블로그 RSS"
          href="/feed.xml"
        />
      </head>
      {/* 깜빡임 방지: bg/color 를 Tailwind class 가 아닌 globals.css body 의 CSS var
          (--background/--foreground) 로 처리. inline script 가 html.dark 를 paint
          전에 set 하면 CSS var 가 바로 dark 값으로 적용된다. */}
      <body className="min-h-full flex flex-col selection:bg-neutral-900 selection:text-white dark:selection:bg-white dark:selection:text-neutral-900">
        {/* Google Tag Manager noscript fallback — JS 차단 환경 페이지뷰 보정 */}
        {process.env.NODE_ENV === "production" && (
          <noscript>
            <iframe
              src="https://www.googletagmanager.com/ns.html?id=GTM-WC48R8J8"
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        {/* useSearchParams(/scores 종목탭 PV 분리) 사용 — Suspense 경계 필수(정적 렌더 유지) */}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <PresenceTracker />
        <EmbedAuthLinks />
        <SiteChromeHeader
          main={
            <>
              <Header />
              <LiveScoresBar />
            </>
          }
          scoreboard={<ScoreboardHeader />}
          en={<EnHeader />}
        />
        <main className="flex-1 w-full">{children}</main>
        <SiteChromeFooter
          main={<Footer />}
          scoreboard={
            <footer className="mt-8 border-t border-neutral-200 dark:border-neutral-800 py-5 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
              본 스코어는{" "}
              {/* 사람만 통과: rel=nofollow + robots Disallow(/go) 경유 302 — 봇은 경유 차단 */}
              <a
                href="/go/scorebase"
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                스코어베이스
              </a>
              가 제공하는 서비스입니다.
            </footer>
          }
          en={<EnFooter />}
        />
        <EmbedHidden>
          <Chatbot />
          <LivePipScore />
        </EmbedHidden>
        <ResponsiveGuard />
        <Analytics />
      </body>
    </html>
  );
}
