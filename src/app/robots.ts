import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// AI 학습·데이터수집 크롤러 — 검색 노출 0 손실로 콘텐츠 학습 도용만 차단.
// 검색·실시간답변 봇(Googlebot·Bingbot·NaverBot·PerplexityBot·OAI-SearchBot·
// ChatGPT-User 등)은 의도적으로 제외 — 미디어 검색 유입(현재+미래 AI 검색)을 지킨다.
const AI_TRAINING_BOTS = [
  "GPTBot", // OpenAI 학습
  "Google-Extended", // Gemini 학습 (Googlebot 검색 색인과 별개)
  "ClaudeBot", // Anthropic 학습
  "anthropic-ai", // Anthropic 구형 학습
  "Claude-Web", // Anthropic 구형 학습
  "CCBot", // CommonCrawl — 다수 LLM 학습셋 원천
  "Bytespider", // ByteDance(TikTok/Doubao) — 공격적 스크래핑
  "Applebot-Extended", // Apple Intelligence 학습 (Applebot 검색은 유지)
  "Amazonbot", // Amazon AI 학습
  "Meta-ExternalAgent", // Meta(Llama) AI 학습
];

// SEO 업체용 크롤러 — 백링크·경쟁사 분석 데이터 수집기라 검색 유입 기여 0.
// 2026-08-01 AhrefsBot 이 /live/* 를 일 13k PV 크롤해 차단 (robots.txt 준수 봇들).
const SEO_TOOL_BOTS = [
  "AhrefsBot", // Ahrefs 백링크 수집
  "SemrushBot", // Semrush
  "MJ12bot", // Majestic
  "DotBot", // Moz
  // Yandex — 검색엔진이지만 러시아향이라 한국 사이트 유입 기여 0.
  // 렌더봇(YandexRenderResourcesBot)이 JS 까지 실행하며 크롤해 비용만 발생 (2026-08-01 실측).
  // "Yandex" 한 단어가 Yandex 계열 봇 전체에 적용된다 (Yandex robots 규격).
  "Yandex",
];

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /go — 사람 전용 외부 이동 통로 (스코어보드 footer → scorebase). 봇 경유 차단.
        disallow: ["/admin", "/api/admin", "/go"],
      },
      // AI 학습 크롤러 — 전 경로 차단 (개별 그룹으로 펼쳐 파서 호환성 확보).
      ...AI_TRAINING_BOTS.map((ua) => ({ userAgent: ua, disallow: "/" })),
      // SEO 툴 크롤러 — 전 경로 차단.
      ...SEO_TOOL_BOTS.map((ua) => ({ userAgent: ua, disallow: "/" })),
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
