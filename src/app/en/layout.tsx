// /en 구간 공통 레이아웃 — 영문 메타 기본값 + html lang 보정. 헤더/푸터는 root layout 의
// SiteChromeHeader/Footer 가 경로 기반으로 영어 크롬을 렌더한다.
import type { Metadata } from "next";
import HtmlLangEn from "@/components/en/HtmlLangEn";

export const metadata: Metadata = {
  title: {
    default: "Scorebase — AI Sports Predictions, Standings & Stats",
    template: "%s | Scorebase",
  },
  description:
    "AI-powered predictions, standings and data analysis for Premier League, LaLiga, Bundesliga, MLB, NBA, NHL, KBO and more — built on Elo ratings, market odds and Monte Carlo simulation.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Scorebase",
    title: "Scorebase — AI Sports Predictions, Standings & Stats",
    description:
      "AI-powered predictions, standings and data analysis for football, baseball, basketball and hockey leagues worldwide.",
  },
};

export default function EnLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HtmlLangEn />
      {children}
    </>
  );
}
