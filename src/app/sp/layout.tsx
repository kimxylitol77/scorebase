// sportspredictions.live 공통 레이아웃 — 영어 전용, 자체 다크 토큰(sp.css)·폰트·헤더·푸터.
// 루트 layout 의 스코어베이스 크롬은 SiteChromeHeader/Footer 가 host·경로로 비운다.
import type { Metadata } from "next";
import { Sora, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import HtmlLangEn from "@/components/en/HtmlLangEn";
import SpHeader from "@/components/sp/SpHeader";
import SpFooter from "@/components/sp/SpFooter";
import { SP_NAME, SP_URL } from "@/lib/sp/site";
import "./sp.css";

const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--sp-font-display", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sp-font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--sp-font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SP_URL),
  // default 는 루트 layout 의 "%s | Scorebase" 템플릿을 타므로 absolute 로 끊는다. 하위 페이지는 이 template.
  title: {
    absolute: `${SP_NAME} — Free AI Sports Predictions & Win Probabilities`,
    template: `%s | ${SP_NAME}`,
  },
  description:
    "Free AI match predictions with calibrated win probabilities for Premier League, LaLiga, Bundesliga, Serie A, MLB, NBA, NHL, KBO and more. Every pick is tracked and graded publicly.",
  keywords: [],
  openGraph: { type: "website", locale: "en_US", siteName: SP_NAME },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function SpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`sp-root ${sora.variable} ${jakarta.variable} ${mono.variable}`}>
      <HtmlLangEn />
      <SpHeader />
      <main className="sp-container">{children}</main>
      <SpFooter />
    </div>
  );
}
