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
}

const PATTERNS: Array<{
  re: RegExp;
  category: BotCategory;
  name: string;
}> = [
  // 🔍 검색엔진
  { re: /Googlebot/i, category: "search", name: "Googlebot" },
  { re: /AdsBot-Google/i, category: "search", name: "Google AdsBot" },
  { re: /Mediapartners-Google/i, category: "search", name: "Google AdSense" },
  { re: /bingbot/i, category: "search", name: "Bingbot" },
  { re: /Yandex(Bot|Images)/i, category: "search", name: "YandexBot" },
  { re: /DuckDuckBot/i, category: "search", name: "DuckDuckBot" },
  { re: /Baiduspider/i, category: "search", name: "Baiduspider" },
  { re: /NaverBot|Yeti/i, category: "search", name: "NaverBot" },
  { re: /Daum(oa|Bot)/i, category: "search", name: "Daum" },
  { re: /SeznamBot/i, category: "search", name: "SeznamBot" },

  // 🤖 AI 크롤러
  { re: /GPTBot/i, category: "ai", name: "GPTBot (OpenAI)" },
  { re: /ChatGPT-User/i, category: "ai", name: "ChatGPT-User" },
  { re: /OAI-SearchBot/i, category: "ai", name: "OpenAI SearchBot" },
  { re: /ClaudeBot/i, category: "ai", name: "ClaudeBot (Anthropic)" },
  { re: /Claude-Web/i, category: "ai", name: "Claude-Web" },
  { re: /anthropic-ai/i, category: "ai", name: "Anthropic" },
  { re: /PerplexityBot/i, category: "ai", name: "PerplexityBot" },
  { re: /Perplexity-User/i, category: "ai", name: "Perplexity-User" },
  { re: /Google-Extended/i, category: "ai", name: "Google-Extended (Gemini)" },
  { re: /Bytespider/i, category: "ai", name: "Bytespider (TikTok/Doubao)" },
  { re: /CCBot/i, category: "ai", name: "CommonCrawl" },
  { re: /Applebot/i, category: "ai", name: "Applebot" },

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
      return { isBot: true, category: p.category, name: p.name };
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
