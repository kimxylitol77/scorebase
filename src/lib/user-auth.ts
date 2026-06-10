// 방문자(일반 사용자) 세션 — HMAC 서명 쿠키 + bcryptjs 비밀번호 해싱.
// admin(src/lib/auth.ts) 과 완전 분리: 쿠키명 user_session, payload = userId.
// 쿠키 형식: "userId|timestamp|hex-signature", HMAC-SHA256, 7일 만료.
// (auth.ts 의 HMAC 패턴을 복제 — admin 코드 무수정)

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

export const USER_COOKIE_NAME = "user_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AGE_SEC = MAX_AGE_MS / 1000;

function getSecret(): string {
  // 전용 secret 우선, 없으면 admin secret. 둘 다 없으면 throw — 약한 기본값으로 세션 서명하지 않는다(fail-closed).
  const s = process.env.USER_SESSION_SECRET ?? process.env.ADMIN_SECRET;
  if (!s) throw new Error("USER_SESSION_SECRET/ADMIN_SECRET 미설정 — user 세션 서명 불가 (fail-closed)");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("hex");
}

export interface UserSession {
  userId: string;
  issuedAt: number;
}

/** 세션 쿠키 값 생성 */
export function createUserSessionCookie(userId: string): {
  value: string;
  maxAge: number;
} {
  const ts = Date.now();
  const data = `${userId}|${ts}`;
  return { value: `${data}|${sign(data)}`, maxAge: MAX_AGE_SEC };
}

/** 세션 쿠키 값 검증 — 무효이면 null */
export function readUserSessionCookie(
  value: string | undefined,
): UserSession | null {
  if (!value) return null;
  const parts = value.split("|");
  if (parts.length !== 3) return null;
  const [userId, tsStr, sig] = parts;
  const expected = sign(`${userId}|${tsStr}`);
  if (sig.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > MAX_AGE_MS) return null;
  return { userId, issuedAt: ts };
}

/** bcryptjs 해싱 (cost 10 — 서버리스 cold start 고려) */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
