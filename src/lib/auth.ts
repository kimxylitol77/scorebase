// 관리자 세션 — HMAC 서명된 쿠키 기반.
//
// 쿠키 형식: "username|timestamp|hex-signature"
// 서명: HMAC-SHA256(`username|timestamp`, ADMIN_SECRET)
//
// 만료: 7일

import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "admin_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AGE_SEC = MAX_AGE_MS / 1000;

function getSecret(): string {
  const s = process.env.ADMIN_SECRET;
  if (!s) throw new Error("ADMIN_SECRET 미설정 — admin 세션 서명 불가 (fail-closed)");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

export interface Session {
  username: string;
  issuedAt: number;
}

/** 사용자명/비밀번호 검증 */
export function verifyCredentials(
  username: string,
  password: string,
): boolean {
  const u = process.env.ADMIN_USERNAME ?? "";
  const p = process.env.ADMIN_PASSWORD ?? "";
  if (!u || !p) return false;
  // 길이 다르면 timingSafeEqual 못 씀 → 미리 길이 체크 (timing leak 미미)
  if (username.length !== u.length || password.length !== p.length) {
    return false;
  }
  return (
    timingSafeEqual(Buffer.from(username), Buffer.from(u)) &&
    timingSafeEqual(Buffer.from(password), Buffer.from(p))
  );
}

/** 세션 쿠키 값 생성 */
export function createSessionCookie(username: string): {
  value: string;
  maxAge: number;
} {
  const ts = Date.now();
  const data = `${username}|${ts}`;
  const value = `${data}|${sign(data)}`;
  return { value, maxAge: MAX_AGE_SEC };
}

/** 세션 쿠키 값 검증 — 무효이면 null */
export function readSessionCookie(value: string | undefined): Session | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts.length !== 3) return null;
  const [username, tsStr, sig] = parts;
  const data = `${username}|${tsStr}`;
  const expected = sign(data);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > MAX_AGE_MS) return null;
  return { username, issuedAt: ts };
}
