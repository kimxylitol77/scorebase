// 유입 채널 분류 — PageView.referrer(랜딩 PV 의 document.referrer) 호스트를
// 구글/네이버/다음/빙/인스타/스레드/X 등으로 매핑. /admin/stats 유입 채널 섹션용.
//
// 한계 (정확도에 대한 정직한 기준):
// - referrer 없는 유입은 전부 "직접" — 즐겨찾기·주소창 + 카카오톡 등 referrer 를
//   안 남기는 앱 인앱 브라우저도 여기 합산된다.
// - 인스타/스레드/X 인앱 브라우저는 보통 l.instagram.com / t.co 류 referrer 를 남겨
//   식별되지만 OS·버전에 따라 누락될 수 있다 (= SNS 유입의 하한선으로 해석).

export type TrafficChannel =
  | "google"
  | "naver"
  | "daum"
  | "bing"
  | "instagram"
  | "threads"
  | "x"
  | "facebook"
  | "kakao"
  | "youtube"
  | "telegram"
  | "ai_chat"
  | "search_other"
  | "referral"
  | "direct";

export const CHANNEL_META: Record<TrafficChannel, { label: string; emoji: string }> = {
  direct: { label: "직접 (즐겨찾기·주소창)", emoji: "🔖" },
  google: { label: "구글", emoji: "🟢" },
  naver: { label: "네이버", emoji: "🟩" },
  daum: { label: "다음", emoji: "🟨" },
  bing: { label: "빙", emoji: "🔷" },
  instagram: { label: "인스타그램", emoji: "📸" },
  threads: { label: "스레드", emoji: "🧵" },
  x: { label: "X (트위터)", emoji: "✖️" },
  facebook: { label: "페이스북", emoji: "🔵" },
  kakao: { label: "카카오톡 (utm)", emoji: "💬" },
  youtube: { label: "유튜브", emoji: "▶️" },
  telegram: { label: "텔레그램", emoji: "📨" },
  ai_chat: { label: "AI 검색 (ChatGPT 등)", emoji: "🤖" },
  search_other: { label: "기타 검색엔진", emoji: "🔍" },
  referral: { label: "기타 사이트", emoji: "🔗" },
};

/** 채널 표시 순서 — 유입 채널 표 고정 순서 (값 0 이어도 자리 유지). */
export const CHANNEL_ORDER: TrafficChannel[] = [
  "direct",
  "google",
  "naver",
  "daum",
  "bing",
  "instagram",
  "threads",
  "x",
  "facebook",
  "kakao",
  "youtube",
  "telegram",
  "ai_chat",
  "search_other",
  "referral",
];

/** utm_source 값 → 채널. SNS 프로필/공유 링크에 ?utm_source=instagram 식으로
 *  붙이면 referrer 가 안 남는 인앱(카톡 등)도 100% 식별 — referrer 분류보다 우선. */
const UTM_SOURCE_CHANNEL: Record<string, TrafficChannel> = {
  instagram: "instagram",
  insta: "instagram",
  ig: "instagram",
  threads: "threads",
  x: "x",
  twitter: "x",
  facebook: "facebook",
  fb: "facebook",
  kakao: "kakao",
  kakaotalk: "kakao",
  katalk: "kakao",
  youtube: "youtube",
  telegram: "telegram",
  tg: "telegram",
  naver: "naver",
  google: "google",
  "chatgpt.com": "ai_chat",
  chatgpt: "ai_chat",
  openai: "ai_chat",
  perplexity: "ai_chat",
  "perplexity.ai": "ai_chat",
  "claude.ai": "ai_chat",
  claude: "ai_chat",
  copilot: "ai_chat",
  "copilot.com": "ai_chat",
};

/** 우리 서비스 도메인 — referrer 가 이들이면 내부 이동(유입 아님). */
export function isInternalReferrerHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return (
    h === "localhost" ||
    h.startsWith("127.") ||
    h.endsWith(".vercel.app") ||
    h.includes("scorebase.kr") ||
    h.includes("xn--hy1bm7m1yevrd8pq") || // 스코어보드.kr (punycode)
    h.includes("xn--9k3b13iba842abwcsvs") // 스코어베이스.com (punycode)
  );
}

const matchers: Array<{ channel: TrafficChannel; re: RegExp }> = [
  // AI 챗 — 검색엔진보다 먼저 판정해야 한다. gemini.google.com 은 아래 google 정규식에
  // 걸리고, copilot.microsoft.com 도 MS 검색 계열로 오분류될 여지가 있다.
  {
    channel: "ai_chat",
    re: /^(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|gemini\.google\.com)$/,
  },
  // 검색
  { channel: "google", re: /(^|\.)google\.[a-z.]+$/ },
  { channel: "naver", re: /(^|\.)naver\.(com|me)$/ },
  { channel: "daum", re: /(^|\.)daum\.net$/ },
  { channel: "bing", re: /(^|\.)bing\.com$/ },
  // SNS
  { channel: "instagram", re: /(^|\.)instagram\.com$/ },
  { channel: "threads", re: /(^|\.)threads\.(net|com)$/ },
  { channel: "x", re: /(^|\.)(x\.com|twitter\.com|t\.co)$/ },
  { channel: "facebook", re: /(^|\.)(facebook\.com|fb\.me|fb\.com|messenger\.com)$/ },
  { channel: "youtube", re: /(^|\.)(youtube\.com|youtu\.be)$/ },
  // 기타 검색엔진
  {
    channel: "search_other",
    re: /(^|\.)(yahoo\.[a-z.]+|duckduckgo\.com|baidu\.[a-z.]+|startpage\.com|ecosia\.org|search\.brave\.com|ya(ndex)?\.[a-z.]+|zum\.com|nate\.com)$/,
  },
];

export function classifyReferrer(referrer: string | null): {
  channel: TrafficChannel;
  /** referral 일 때 출처 도메인 (그 외 채널은 null) */
  domain: string | null;
} {
  if (!referrer) return { channel: "direct", domain: null };
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { channel: "direct", domain: null };
  }
  if (isInternalReferrerHost(host)) return { channel: "direct", domain: null };
  for (const m of matchers) {
    if (m.re.test(host)) return { channel: m.channel, domain: null };
  }
  return { channel: "referral", domain: host };
}

/** utm_source 우선 분류 — utm 매핑되면 그 채널, 아니면 referrer 분류.
 *  (utm 값이 미등록 문자열이면 referrer 분류로 폴백 후, 그래도 direct 면 referral 로
 *  두지 않고 direct 유지 — utm 만으로 출처를 단정하지 않는다) */
export function classifyLanding(
  referrer: string | null,
  utmSource: string | null,
): { channel: TrafficChannel; domain: string | null } {
  if (utmSource) {
    const mapped = UTM_SOURCE_CHANNEL[utmSource];
    if (mapped) return { channel: mapped, domain: null };
  }
  return classifyReferrer(referrer);
}

/** 검색엔진 referrer 에서 검색어 추출 — 네이버/다음/빙/야후/줌 등은 referrer URL 에
 *  검색어 파라미터가 그대로 남는다. 구글은 2011년부터 비공개(origin 만 전송) —
 *  구글 검색어는 Google Search Console API 로만 확인 가능. */
const SEARCH_QUERY_PARAMS: Array<{ hostRe: RegExp; params: string[] }> = [
  { hostRe: /(^|\.)naver\.com$/, params: ["query"] },
  { hostRe: /(^|\.)daum\.net$/, params: ["q"] },
  { hostRe: /(^|\.)bing\.com$/, params: ["q"] },
  { hostRe: /(^|\.)yahoo\.[a-z.]+$/, params: ["p", "q"] },
  { hostRe: /(^|\.)duckduckgo\.com$/, params: ["q"] },
  { hostRe: /(^|\.)zum\.com$/, params: ["query", "q"] },
  { hostRe: /(^|\.)nate\.com$/, params: ["q"] },
  { hostRe: /(^|\.)baidu\.[a-z.]+$/, params: ["wd", "word"] },
];

export function extractSearchQuery(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const s of SEARCH_QUERY_PARAMS) {
      if (!s.hostRe.test(host)) continue;
      for (const p of s.params) {
        const q = u.searchParams.get(p)?.trim();
        if (q) return q.slice(0, 80);
      }
    }
    return null;
  } catch {
    return null;
  }
}
