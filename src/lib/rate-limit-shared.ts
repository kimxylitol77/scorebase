// 인스턴스를 넘어 공유되는 속도 제한 — Upstash Redis REST(fetch 기반, edge 미들웨어에서 동작).
// UPSTASH_REDIS_REST_URL·UPSTASH_REDIS_REST_TOKEN 이 없거나 Redis 가 300ms 안에 답하지 않으면 기존 메모리 카운터(rate-limit.ts)로 폴백한다.
// 한 창(window) 안 요청 수를 INCR 로 세고, 넘으면 lock 키를 lockMs 동안 세운다 — 메모리 구현과 같은 의미.
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

export interface SharedLimitOpts {
  max: number;
  windowMs: number;
  lockMs: number;
}

type PipelineResult = Array<{ result?: unknown; error?: string }>;

function env() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const isSharedLimiterConfigured = () => env() != null;

/** Upstash REST pipeline — 명령 배열을 한 번에. 실패·지연은 throw → 호출자가 메모리 폴백. */
export async function redisPipeline(commands: (string | number)[][], timeoutMs = 300): Promise<PipelineResult> {
  const e = env();
  if (!e) throw new Error("redis not configured");
  const r = await fetch(`${e.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${e.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`redis http ${r.status}`);
  return (await r.json()) as PipelineResult;
}

/** pipeline 응답 → 판정. 순서: [lock TTL(ms, 없으면 -2), INCR 값, PEXPIRE NX 결과]. */
export function judge(res: PipelineResult, opts: SharedLimitOpts): { result: RateLimitResult; shouldLock: boolean } {
  const lockTtl = Number(res[0]?.result ?? -2);
  if (lockTtl > 0) return { result: { allowed: false, remaining: 0, retryAfterSec: Math.ceil(lockTtl / 1000) }, shouldLock: false };
  const count = Number(res[1]?.result ?? 0);
  if (count > opts.max) return { result: { allowed: false, remaining: 0, retryAfterSec: Math.ceil(opts.lockMs / 1000) }, shouldLock: true };
  return { result: { allowed: true, remaining: Math.max(0, opts.max - count), retryAfterSec: 0 }, shouldLock: false };
}

export async function rateLimitShared(key: string, opts: SharedLimitOpts): Promise<RateLimitResult & { backend: "redis" | "memory" }> {
  if (!env()) return { ...rateLimit(key, opts), backend: "memory" };
  const cKey = `rl:c:${key}`;
  const lKey = `rl:l:${key}`;
  try {
    const res = await redisPipeline([
      ["PTTL", lKey],
      ["INCR", cKey],
      ["PEXPIRE", cKey, opts.windowMs, "NX"],
    ]);
    const { result, shouldLock } = judge(res, opts);
    if (shouldLock) {
      // 잠금은 한 번만 세우면 된다 — 실패해도 다음 요청이 다시 세운다.
      redisPipeline([["SET", lKey, "1", "PX", opts.lockMs]]).catch(() => {});
    }
    return { ...result, backend: "redis" };
  } catch {
    return { ...rateLimit(key, opts), backend: "memory" };
  }
}

const onceMemory = new Map<string, number>();

/** 같은 키로 ttlSec 안에 처음이면 true — 알림 중복 방지. Redis 없으면 인스턴스 메모리. */
export async function onceShared(key: string, ttlSec: number): Promise<boolean> {
  if (env()) {
    try {
      const res = await redisPipeline([["SET", `once:${key}`, "1", "EX", ttlSec, "NX"]]);
      return res[0]?.result === "OK";
    } catch {
      // 폴백
    }
  }
  const now = Date.now();
  const until = onceMemory.get(key);
  if (until && until > now) return false;
  onceMemory.set(key, now + ttlSec * 1000);
  return true;
}
