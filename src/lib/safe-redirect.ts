// 로그인·가입·구글 로그인의 "돌아갈 곳(from)" 값을 사이트 안 경로로만 좁히는 공용 함수 — 열린 리다이렉트 방지.
// startsWith("/") && !startsWith("//") 만으로는 "/\evil.com" 을 못 막는다. 브라우저·URL 파서가 "\" 를 "/" 로 읽어
// "//evil.com" 이 되기 때문(2026-10-01 Strix 점검 지적). 가짜 기준 주소에 실제로 풀어 보고 사이트가 바뀌었는지로 판정한다.
const BASE = "http://safe-redirect.invalid";

/** 같은 사이트 안 경로면 pathname+search+hash, 아니면 "/". */
export function safeRedirectPath(from: string | null | undefined): string {
  if (!from) return "/";
  try {
    const u = new URL(from, BASE);
    if (u.origin !== BASE) return "/";
    return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    return "/";
  }
}
