// 단순 in-memory rate limiter — Vercel serverless 에서 instance warm 동안 동작.
// 영구 저장이 필요하면 Vercel KV / Upstash Redis 로 교체.

interface Bucket {
  count: number;
  firstHitAt: number;
  lockedUntil?: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5분
const DEFAULT_MAX = 10; // 5분에 10번까지 시도
const LOCK_MS = 15 * 60 * 1000; // 잠금 15분

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  opts?: { max?: number; windowMs?: number; lockMs?: number },
): RateLimitResult {
  const max = opts?.max ?? DEFAULT_MAX;
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const lockMs = opts?.lockMs ?? LOCK_MS;
  const now = Date.now();

  const b = buckets.get(key);
  if (!b) {
    buckets.set(key, { count: 1, firstHitAt: now });
    return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
  }

  // 잠금 중
  if (b.lockedUntil && b.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000),
    };
  }

  // 윈도우 만료 → 리셋
  if (now - b.firstHitAt > windowMs) {
    b.count = 1;
    b.firstHitAt = now;
    b.lockedUntil = undefined;
    return { allowed: true, remaining: max - 1, retryAfterSec: 0 };
  }

  b.count += 1;
  if (b.count > max) {
    b.lockedUntil = now + lockMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil(lockMs / 1000),
    };
  }
  return { allowed: true, remaining: max - b.count, retryAfterSec: 0 };
}

/** 성공 시 카운터 리셋 */
export function rateLimitReset(key: string) {
  buckets.delete(key);
}
