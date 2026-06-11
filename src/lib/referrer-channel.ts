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
  | "youtube"
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
  youtube: { label: "유튜브", emoji: "▶️" },
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
  "youtube",
  "search_other",
  "referral",
];

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
