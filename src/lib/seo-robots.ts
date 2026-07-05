// 얇은 자동생성 페이지의 검색 색인 제외 정책 단일 정의 — 대량 thin 페이지가 도메인 품질 신호를 희석하는 문제 대응.
import type { Metadata } from "next";

// 구글에만 색인 제외(빙 등 나머지는 색인 유지). follow 는 유지해 링크 자산은 전달.
// 라이브 매치처럼 구글은 thin 판정으로 색인 거부하지만 빙에선 노출되는 페이지에 사용.
export const GOOGLE_NOINDEX: Metadata["robots"] = {
  googleBot: { index: false, follow: true },
};
