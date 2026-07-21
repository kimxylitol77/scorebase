// 원클릭 숨김 링크용 항목별 HMAC 토큰 — ADMIN_SECRET 을 URL 에 싣지 않기 위함.
// 토큰 = HMAC_SHA256(key=ADMIN_SECRET, "{kind}:{id}") 앞 32hex.
// 텔레그램·로그에 토큰이 새어도 그 항목 1건에만 유효하고 다른 항목 위조는 불가.
// (2026-07 감사: ?s=ADMIN_SECRET 평문 링크가 텔레그램으로 발송되던 문제 대체)
import { createHmac, timingSafeEqual } from "crypto";

export type HideKind = "briefing" | "rumor";

export function makeHideToken(kind: HideKind, id: string): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret)
    .update(`${kind}:${id}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyHideToken(
  kind: HideKind,
  id: string,
  token: string | null,
): boolean {
  const expected = makeHideToken(kind, id);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
