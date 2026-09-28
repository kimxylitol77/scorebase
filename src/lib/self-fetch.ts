// 우리 서버리스 함수가 우리 사이트를 부를 때 쓰는 공용 fetch — Vercel 방화벽 봇 검문을 통과하는 신분 표시를 붙인다.
// 배경: 2026-09-23 bot_protection 을 challenge 로 올린 뒤, 함수의 자기 호출(기본 UA "node")이 검문에 걸려
//   429 + x-vercel-mitigated: challenge 를 받았다. 방화벽의 「우리 인프라 통과」 규칙은 UA 의 "vercel-cron",
//   경로 /api/internal/, 등록 IP(Vultr·집)만 통과시킨다. 함수의 출구 IP 는 고정이 아니라 UA 로 맞춘다.
//   규칙을 바꾸면 SELF_UA_MARK 도 같이 볼 것. 점검은 GET /api/internal/firewall-selfcheck.

/** 방화벽 통과 규칙이 보는 문자열 */
export const SELF_UA_MARK = "vercel-cron";

export function selfUserAgent(caller: string): string {
  return `${SELF_UA_MARK}/1.0 (scorebase-${caller})`;
}

/** apex(scorebase.kr)는 www 로 리다이렉트되고, Node fetch 는 리다이렉트에서 Authorization 을 떨어뜨린다 — www 로 정규화 */
export function siteOrigin(): string {
  return (process.env.SITE_URL || "https://www.scorebase.kr").replace("://scorebase.kr", "://www.scorebase.kr");
}

/** path 는 "/" 로 시작. caller 는 누가 불렀는지(로그·방화벽 이벤트에서 구분용) */
export function selfFetch(path: string, caller: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("user-agent", selfUserAgent(caller));
  return fetch(`${siteOrigin()}${path}`, { cache: "no-store", ...init, headers });
}
