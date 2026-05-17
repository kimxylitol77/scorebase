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
