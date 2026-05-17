import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LiveScoresBar from "@/components/LiveScoresBar";
import PageViewTracker from "@/components/PageViewTracker";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      // 핵심: SSR HTML 부터 dark class + dark inline style. 사용자가 명시적으로
      // localStorage.theme='light' 설정한 경우에만 client script 가 제거.
      // 이렇게 하면 첫 paint 가 무조건 dark — light 모드 사용자만 한 번 깜빡임.
      className={`dark ${geistMono.variable} h-full antialiased`}
      style={{
        backgroundColor: "#0a0a0a",
        color: "#ededed",
        colorScheme: "dark",
      }}
      suppressHydrationWarning
    >
      <head>
        {/* light 모드 사용자만 dark 제거 (localStorage 명시 또는 OS prefers light) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var prefersLight=t==='light'||(t!=='dark'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);if(prefersLight){var h=document.documentElement;h.classList.remove('dark');h.style.backgroundColor='#ffffff';h.style.color='#0a0a0a';h.style.colorScheme='light';}}catch(e){}})();`,
          }}
        />
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
        <PageViewTracker />
        <Header />
        <LiveScoresBar />
        <main className="flex-1 w-full">{children}</main>
        <Footer />
        {/* <Chatbot />  결제(크레딧) 이슈 해결 시까지 비활성 */}
      </body>
    </html>
  );
}
