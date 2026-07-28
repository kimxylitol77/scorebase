// 사이트 canonical URL — sitemap·robots·canonical 메타·OG·JSON-LD 가 모두 동일 도메인을 가리켜야
// Google "Discovered - currently not indexed" 상태를 피할 수 있어 helper 로 정규화.
//
// production canonical = https://www.scorebase.kr (apex 는 307 redirect)
// env (Vercel) SITE_URL 이 apex 로 박혀 있어도 코드에서 강제로 www 로 변환.

const FALLBACK = "https://www.scorebase.kr";

function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/\/$/, "")
    .replace(/^http:\/\//i, "https://")
    .replace(/^https:\/\/scorebase\.kr(?=\/|$)/i, "https://www.scorebase.kr");
}

export const SITE_URL = normalize(process.env.SITE_URL ?? FALLBACK);

/** SNS 게시물(캡션·설명란)에 넣을 링크 — utm_source 를 붙여 유입 채널을 식별한다.
 *  인앱 브라우저는 referrer 를 자주 유실해 utm 없이는 전부 "직접" 유입으로 샌다.
 *  값은 lib/referrer-channel.ts 의 UTM_SOURCE_CHANNEL 에 등록된 것만 쓴다.
 *  path 에 이미 쿼리가 있어도 URL 로 조립하므로 ?/& 가 깨지지 않는다. */
export function snsLink(path: string, source: "threads" | "instagram" | "youtube"): string {
  const u = new URL(path, SITE_URL);
  u.searchParams.set("utm_source", source);
  return u.toString();
}
