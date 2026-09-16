// 내부용 JSON API 의 같은 출처 검사 — 우리 페이지가 브라우저에서 부르는 라우트는 외부 스크립트(curl·타 사이트)의 직접 호출을 거절한다.
// 판정은 브라우저가 붙이는 sec-fetch-site 헤더 → 없으면 Origin/Referer 호스트 → 없으면 내부 워커 Bearer 토큰 순.
// 헤더는 위조할 수 있으므로 "차단" 이 아니라 "문턱" 이다. 공개로 열어둔 라우트(순위·배당 변동·임베드·라이브 통합·v1)는 대상이 아니다.

/** 보호 대상 접두사 — 화면이 내부적으로 쓰는 JSON 라우트만. 새 라우트를 열 땐 여기에 넣거나 공개 목록에 넣거나 둘 중 하나를 결정한다. */
export const PROTECTED_API_PREFIXES = [
  "/api/live/", // 경기 상세·박스스코어·투구 로그·이벤트 (live/scores 는 아래 예외)
  "/api/matches/",
  "/api/teams/",
  "/api/search/",
  "/api/compare/",
  "/api/transfers/",
  "/api/weather",
  "/api/me",
  "/api/match-sim",
  "/api/bot-backtest",
  "/api/rule-backtest",
] as const;

/** 보호 접두사 안에서도 열어 두는 것 — 워커·임베드·외부 위젯이 직접 부른다. */
export const PROTECTED_API_EXCEPTIONS = ["/api/live/scores"] as const;

const OUR_HOSTS = [
  "scorebase.kr",
  "www.scorebase.kr",
  "localhost",
  "127.0.0.1",
  // 서브 도메인(스코어보드.kr·스코어베이스.com) — punycode
  "xn--hy1bm7m1yevrd8pq.kr",
  "xn--9k3b13iba842abwcsvs.com",
];

export function isProtectedApiPath(path: string): boolean {
  if (PROTECTED_API_EXCEPTIONS.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) return false;
  return PROTECTED_API_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isOurHost(host: string | null): boolean {
  if (!host) return false;
  return OUR_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * 같은 사이트에서 온 요청인가.
 * - sec-fetch-site: same-origin·same-site → 통과, cross-site·none → 거절 (직접 URL 입력·외부 사이트·대부분의 스크립트)
 * - 헤더가 없으면(구형 브라우저·일부 앱) Origin/Referer 호스트로 판정
 * - 내부 워커는 Authorization: Bearer INTERNAL_API_TOKEN 으로 통과
 */
export function isSameSiteRequest(h: HeaderReader, internalToken?: string | null): boolean {
  const auth = h.get("authorization");
  if (internalToken && auth === `Bearer ${internalToken}`) return true;
  const sfs = (h.get("sec-fetch-site") || "").toLowerCase();
  if (sfs === "same-origin" || sfs === "same-site") return true;
  if (sfs === "cross-site" || sfs === "none") return false;
  return isOurHost(hostOf(h.get("origin"))) || isOurHost(hostOf(h.get("referer")));
}
