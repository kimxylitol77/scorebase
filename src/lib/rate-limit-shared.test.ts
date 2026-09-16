// 공유 속도 제한 판정 테스트 — Redis 응답 해석과 메모리 폴백
import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, rateLimitShared, onceShared } from "./rate-limit-shared";

const opts = { max: 3, windowMs: 60_000, lockMs: 30_000 };

test("판정 — 잠금 TTL 있으면 거절, 창 안 초과면 잠금 지시, 그 외 통과", () => {
  assert.deepEqual(judge([{ result: 12_000 }, { result: 1 }, { result: 1 }], opts), { result: { allowed: false, remaining: 0, retryAfterSec: 12 }, shouldLock: false });
  assert.deepEqual(judge([{ result: -2 }, { result: 4 }, { result: 0 }], opts), { result: { allowed: false, remaining: 0, retryAfterSec: 30 }, shouldLock: true });
  assert.deepEqual(judge([{ result: -2 }, { result: 2 }, { result: 1 }], opts), { result: { allowed: true, remaining: 1, retryAfterSec: 0 }, shouldLock: false });
});

test("환경변수 없으면 메모리 폴백 — 한도 초과 시 잠금", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  const k = `t:${Date.now()}`;
  for (let i = 0; i < 3; i++) assert.equal((await rateLimitShared(k, opts)).allowed, true);
  const r = await rateLimitShared(k, opts);
  assert.equal(r.allowed, false);
  assert.equal(r.backend, "memory");
});

test("onceShared — 첫 호출만 true", async () => {
  const k = `once:${Date.now()}`;
  assert.equal(await onceShared(k, 60), true);
  assert.equal(await onceShared(k, 60), false);
});
