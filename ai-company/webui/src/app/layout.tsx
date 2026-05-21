import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 회사 회의방",
  description: "scorebase 멀티 에이전트 자율 회의",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
