// 사이트가 직접 만들어 운영하는 봇 계정 판정 — 픽봇·브리핑봇 등.
// 이 계정들은 포인트로 상점 아이템을 사지 않으므로, 관리자가 프로필을 직접 지정한다.
// 실제 회원 프로필은 관리자도 건드리지 않는다(본인 것이다) — 그 경계가 이 함수다.

/** 내부 봇 계정 이메일 도메인. 가입 폼으로는 만들 수 없는 주소라 회원과 절대 겹치지 않는다. */
export const BOT_EMAIL_DOMAIN = "@scorebase.internal";

export function isBotAccount(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(BOT_EMAIL_DOMAIN);
}
