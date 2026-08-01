// User-Agent 문자열로 봇 / 크롤러 판별.
// 카테고리: 검색엔진 / AI 크롤러 / SNS / 모니터 / 일반 봇.
//
// 보수적으로 — 명확히 봇임을 표시하는 UA 만 봇으로 분류. 모호한 건 사람.

export type BotCategory =
  | "search"   // Googlebot, bingbot, naver, daum 등 검색엔진
  | "ai"       // GPTBot, ClaudeBot, Anthropic, PerplexityBot 등 AI 학습/검색
  | "social"   // Facebook, Twitter, Slack 등 미리보기 봇
  | "monitor"  // UptimeRobot, Pingdom 등
  | "generic"; // Crawler, Spider, Bot, Curl, Python 등

export interface BotInfo {
  isBot: boolean;
  category?: BotCategory;
  /** 식별된 봇의 짧은 이름 (예: "Googlebot", "GPTBot") */
  name?: string;
  /** AI 검색·실시간 인용 봇(학습/스크래핑과 구분) — GEO 위해 rate limit 면제 대상 */
  aiSearch?: boolean;
}

const PATTERNS: Array<{
  re: RegExp;
  category: BotCategory;
  name: string;
  aiSearch?: boolean;
}> = [
  // 🔍 검색엔진
  { re: /Googlebot/i, category: "search", name: "Googlebot" },
  { re: /AdsBot-Google/i, category: "search", name: "Google AdsBot" },
  { re: /Mediapartners-Google/i, category: "search", name: "Google AdSense" },
  { re: /bingbot/i, category: "search", name: "Bingbot" },
  // YandexRenderResourcesBot 등 변형이 많아 Yandex 전체 매칭 (2026-08-01 실측:
  // 렌더봇이 사람으로 집계돼 의심 세션의 36% 차지 — 좁은 패턴이 놓치고 있었다)
  { re: /Yandex/i, category: "search", name: "YandexBot" },
  { re: /DuckDuckBot/i, category: "search", name: "DuckDuckBot" },
  { re: /Baiduspider/i, category: "search", name: "Baiduspider" },
  { re: /NaverBot|Yeti/i, category: "search", name: "NaverBot" },
  { re: /Daum(oa|Bot)/i, category: "search", name: "Daum" },
  { re: /SeznamBot/i, category: "search", name: "SeznamBot" },

  // 🤖 AI 크롤러 — 학습/스크래핑(robots 차단·rate limit 대상) vs 검색·인용(aiSearch: GEO 위해 면제)
  { re: /GPTBot/i, category: "ai", name: "GPTBot (OpenAI)" }, // 학습
  { re: /ChatGPT-User/i, category: "ai", name: "ChatGPT-User", aiSearch: true }, // 실시간 인용
  { re: /OAI-SearchBot/i, category: "ai", name: "OpenAI SearchBot", aiSearch: true }, // 검색 색인
  { re: /ClaudeBot/i, category: "ai", name: "ClaudeBot (Anthropic)" }, // 학습
  { re: /Claude-SearchBot/i, category: "ai", name: "Claude-SearchBot", aiSearch: true }, // 검색 색인
  { re: /Claude-User/i, category: "ai", name: "Claude-User", aiSearch: true }, // 실시간 인용(claude.ai)
  { re: /Claude-Web/i, category: "ai", name: "Claude-Web" }, // 구형 학습
  { re: /anthropic-ai/i, category: "ai", name: "Anthropic" }, // 구형 학습
  { re: /PerplexityBot/i, category: "ai", name: "PerplexityBot", aiSearch: true }, // 검색 색인
  { re: /Perplexity-User/i, category: "ai", name: "Perplexity-User", aiSearch: true }, // 실시간 인용
  { re: /Google-Extended/i, category: "ai", name: "Google-Extended (Gemini)" }, // 학습
  { re: /Bytespider/i, category: "ai", name: "Bytespider (TikTok/Doubao)" }, // 공격적 스크래핑
  { re: /CCBot/i, category: "ai", name: "CommonCrawl" }, // 학습셋 원천
  { re: /Applebot/i, category: "ai", name: "Applebot", aiSearch: true }, // Apple/Siri 검색

  // 💬 SNS / 미리보기
  { re: /facebookexternalhit/i, category: "social", name: "Facebook" },
  { re: /Twitterbot/i, category: "social", name: "Twitterbot" },
  { re: /LinkedInBot/i, category: "social", name: "LinkedInBot" },
  { re: /Slackbot/i, category: "social", name: "Slackbot" },
  { re: /TelegramBot/i, category: "social", name: "TelegramBot" },
  { re: /Discordbot/i, category: "social", name: "Discordbot" },
  { re: /WhatsApp/i, category: "social", name: "WhatsApp" },
  { re: /KakaoTalk-Scrap/i, category: "social", name: "KakaoTalk" },
  { re: /Iframely/i, category: "social", name: "Iframely" },

  // 📡 모니터링
  { re: /UptimeRobot/i, category: "monitor", name: "UptimeRobot" },
  { re: /Pingdom/i, category: "monitor", name: "Pingdom" },
  { re: /StatusCake/i, category: "monitor", name: "StatusCake" },
  { re: /vercel-screenshot/i, category: "monitor", name: "Vercel" },
  { re: /Better\s?Stack/i, category: "monitor", name: "Better Stack" },
  // scorebase 자체 모니터 봇 — route-guardian 의 sitemap 전수 크롤(2096개)이
  // 자기 IP rate limit 에 걸려 429 false positive 나던 것 면제 (2026-06-18).
  { re: /scorebase-(route-guardian|monitor|synthetic|endpoint)/i, category: "monitor", name: "Scorebase Internal" },

  // 🕷 일반 — 마지막에 검사 (위 패턴 우선)
  // 헤드리스 브라우저 — UA 에 스스로 표시하는 자동화(Puppeteer/Playwright 기본값).
  // 2026-07-22 실측: 사람으로 집계되던 유입에 11건 섞여 있었다. generic 이라
  // rate limit 면제 대상은 아니므로 차단 정책은 그대로.
  { re: /HeadlessChrome/i, category: "generic", name: "HeadlessChrome" },
  { re: /SemrushBot/i, category: "generic", name: "SemrushBot" },
  { re: /AhrefsBot/i, category: "generic", name: "AhrefsBot" },
  { re: /DotBot/i, category: "generic", name: "DotBot" },
  { re: /MJ12bot/i, category: "generic", name: "MJ12bot" },
  { re: /BLEXBot/i, category: "generic", name: "BLEXBot" },
  { re: /PetalBot/i, category: "generic", name: "PetalBot (Huawei)" },
  { re: /python-requests/i, category: "generic", name: "python-requests" },
  { re: /\bcurl\//i, category: "generic", name: "curl" },
  { re: /\bwget\//i, category: "generic", name: "wget" },
  { re: /Go-http-client/i, category: "generic", name: "Go-http-client" },
  { re: /Java\//i, category: "generic", name: "Java HTTP" },
  // 광범위한 fallback — bot/crawler/spider 단어가 들어가면
  { re: /\b(bot|crawler|spider|scraper|fetcher)\b/i, category: "generic", name: "기타 봇" },
];

export function detectBot(userAgent: string | null | undefined): BotInfo {
  if (!userAgent) return { isBot: false };
  for (const p of PATTERNS) {
    if (p.re.test(userAgent)) {
      return { isBot: true, category: p.category, name: p.name, aiSearch: p.aiSearch };
    }
  }
  return { isBot: false };
}

/** 봇 카테고리별 한국어 라벨 + 이모지 */
export const BOT_CATEGORY_LABEL: Record<BotCategory, { label: string; emoji: string }> = {
  search: { label: "검색엔진", emoji: "🔍" },
  ai: { label: "AI 크롤러", emoji: "🤖" },
  social: { label: "SNS·메신저", emoji: "💬" },
  monitor: { label: "모니터링", emoji: "📡" },
  generic: { label: "일반·기타", emoji: "🕷" },
};
