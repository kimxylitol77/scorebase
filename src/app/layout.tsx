import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import ScoreboardHeader from "@/components/ScoreboardHeader";
import Footer from "@/components/Footer";
import LiveScoresBar from "@/components/LiveScoresBar";
import PageViewTracker from "@/components/PageViewTracker";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site-url";
// import Chatbot from "@/components/Chatbot"; // 결제(크레딧) 이슈 해결 시까지 비활성

// 한글 콘텐츠가 메인이므로 본문 sans 는 Pretendard 를 우선.
// 영문 코드/숫자는 Geist Mono 를 보조 폰트로.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Scorebase — EPL · NBA · NHL · MLB 데이터 분석 스포츠 미디어",
    template: "%s | Scorebase",
  },
  description:
    "EPL · NBA · NHL · MLB 의 경기 결과·프리뷰·분석. 시즌 순위, Elo 레이팅, 공격·수비 랭킹, 홈/원정 강도, 최근 흐름과 H2H 상대 전적까지 데이터 기반으로 정리.",
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "Scorebase",
    url: SITE_URL,
    title: "Scorebase — 데이터로 보는 글로벌 스포츠",
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
    "EPL", "프리미어리그", "라리가", "분데스리가", "세리에 A", "리그 1", "MLS",
    "챔피언스리그", "NBA", "MLB", "NHL",
    "스포츠 분석", "경기 결과", "경기 프리뷰",
    "Elo 레이팅", "승률 예측", "시즌 시뮬레이션",
    "축구 분석", "야구 분석", "농구 분석",
  ],
  category: "sports",
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
  // SSR 단에 cookie 의 theme 읽어 className 결정 — flash 완전 제거.
  // cookie 없으면 default dark (사이트 기본 dark mode).
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const isDark = themeCookie !== "light"; // 'light' 명시 외에는 모두 dark

  // 스코어보드.kr — 라이브 스코어 전용 도메인. scorebase 메인 헤더/푸터 대신
  // 전용 간소 헤더만 노출 (메인과 똑같아 보이지 않게). 한글 도메인 punycode 매칭.
  const hdrs = await headers();
  const host = (hdrs.get("host") || "").toLowerCase();
  const isScoreboard =
    host.includes("xn--hy1bm7m1yevrd8pq") || host.includes("스코어보드");
  // scoreboard.kr 전용 라이브 스코어 화면(/board) — scorebase 헤더/푸터/배경 완전 제거(독립 레이아웃).
  const isBoard = (hdrs.get("x-pathname") || "").startsWith("/board");
  return (
    <html
      lang="ko"
      className={`${isDark ? "dark " : ""}${geistMono.variable} h-full antialiased`}
      style={
        isDark
          ? { backgroundColor: "#0a0a0a", color: "#ededed", colorScheme: "dark" }
          : { backgroundColor: "#ffffff", color: "#0a0a0a", colorScheme: "light" }
      }
      suppressHydrationWarning
    >
      <head>
        {/* cookie 없는 첫 방문자 대응: localStorage 의 theme 또는 OS prefers-color-scheme 따라
            cookie 동기화 (다음 새로고침부터 SSR 가 cookie 인식). 동시에 첫 paint 도 맞춤. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.match(/(?:^|; )theme=([^;]+)/);if(c){return;}var t=localStorage.getItem('theme');var wantLight=t==='light'||(!t&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);var theme=wantLight?'light':'dark';document.cookie='theme='+theme+'; path=/; max-age=31536000; SameSite=Lax';var h=document.documentElement;if(wantLight){h.classList.remove('dark');h.style.backgroundColor='#ffffff';h.style.color='#0a0a0a';h.style.colorScheme='light';}else{h.classList.add('dark');h.style.backgroundColor='#0a0a0a';h.style.color='#ededed';h.style.colorScheme='dark';}}catch(e){}})();`,
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
        {/* Pretendard — 한국어 본문에 최적화된 변폭 폰트 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
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
        <PageViewTracker />
        {isBoard ? null : isScoreboard ? (
          <ScoreboardHeader />
        ) : (
          <>
            <Header />
            <LiveScoresBar />
          </>
        )}
        <main className="flex-1 w-full">{children}</main>
        {!isBoard && !isScoreboard && <Footer />}
        {/* <Chatbot />  결제(크레딧) 이슈 해결 시까지 비활성 */}
        <Analytics />
      </body>
    </html>
  );
}
