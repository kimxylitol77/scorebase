// 분산 rate limit 회귀 테스트 — IP별·전체 한도와 fail-closed 정책.
import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeChatQuota,
  limitMessage,
  type CounterStore,
  type QuotaPolicy,
} from "./rate-limit-distributed";

const POLICY: QuotaPolicy = {
  burstMax: 3,
  burstWindowMs: 5 * 60 * 1000,
  ipDailyMax: 5,
  globalDailyMax: 8,
};

/** 인스턴스가 몇 개든 같은 카운터를 보는 상황을 흉내낸 저장소. */
function memoryStore(): CounterStore & { keys(): string[] } {
  const state = new Map<string, { count: number; windowStart: Date }>();
  return {
    async bump(key, windowMs, now) {
      const prev = state.get(key);
      const expired = !prev || now.getTime() - prev.windowStart.getTime() > windowMs;
      const next = expired
        ? { count: 1, windowStart: now }
        : { count: prev.count + 1, windowStart: prev.windowStart };
      state.set(key, next);
      return next;
    },
    keys: () => [...state.keys()],
  };
}

const NOW = new Date("2026-07-29T00:00:00.000Z");

test("IP 버스트 한도를 넘기면 429 대상이 된다", async () => {
  const store = memoryStore();
  for (let i = 0; i < POLICY.burstMax; i += 1) {
    const ok = await consumeChatQuota("1.1.1.1", { store, policy: POLICY, now: NOW });
    assert.equal(ok.allowed, true, `${i + 1}번째는 통과해야 한다`);
  }
  const blockedResult = await consumeChatQuota("1.1.1.1", { store, policy: POLICY, now: NOW });
  assert.equal(blockedResult.allowed, false);
  assert.equal(blockedResult.scope, "burst");
  assert.ok(blockedResult.retryAfterSec > 0);
});

test("다른 IP 는 서로의 버스트 한도에 영향받지 않는다", async () => {
  const store = memoryStore();
  for (let i = 0; i < POLICY.burstMax + 1; i += 1) {
    await consumeChatQuota("1.1.1.1", { store, policy: POLICY, now: NOW });
  }
  const other = await consumeChatQuota("2.2.2.2", { store, policy: POLICY, now: NOW });
  assert.equal(other.allowed, true);
});

test("버스트 창이 지나도 IP 일일 한도는 남아 있다", async () => {
  const store = memoryStore();
  let last = await consumeChatQuota("1.1.1.1", { store, policy: POLICY, now: NOW });
  // 버스트 창을 매번 넘겨 버스트 한도는 계속 리셋되게 한다.
  for (let i = 1; i <= POLICY.ipDailyMax + 1; i += 1) {
    const now = new Date(NOW.getTime() + i * 10 * 60 * 1000);
    last = await consumeChatQuota("1.1.1.1", { store, policy: POLICY, now });
  }
  assert.equal(last.allowed, false);
  assert.equal(last.scope, "ip");
});

test("IP 를 바꿔가며 태워도 전체 일일 한도에서 막힌다", async () => {
  const store = memoryStore();
  let last = await consumeChatQuota("10.0.0.0", { store, policy: POLICY, now: NOW });
  for (let i = 1; i <= POLICY.globalDailyMax; i += 1) {
    last = await consumeChatQuota(`10.0.0.${i}`, { store, policy: POLICY, now: NOW });
  }
  assert.equal(last.allowed, false);
  assert.equal(last.scope, "global");
});

test("저장소가 죽으면 무제한 허용이 아니라 차단한다 (fail-closed)", async () => {
  const brokenStore: CounterStore = {
    async bump() {
      throw new Error("Neon 연결 실패");
    },
  };
  const result = await consumeChatQuota("1.1.1.1", { store: brokenStore, policy: POLICY, now: NOW });
  assert.equal(result.allowed, false);
  assert.equal(result.scope, "store");
});

test("전체 한도에 걸리면 IP 카운터를 더 소모하지 않는다", async () => {
  const store = memoryStore();
  for (let i = 0; i <= POLICY.globalDailyMax; i += 1) {
    await consumeChatQuota(`10.0.0.${i}`, { store, policy: POLICY, now: NOW });
  }
  const before = store.keys().length;
  await consumeChatQuota("9.9.9.9", { store, policy: POLICY, now: NOW });
  assert.equal(store.keys().length, before, "전체 한도 초과 후엔 새 IP 키를 만들지 않는다");
});

test("한도 종류별로 다른 안내 문구를 준다", () => {
  assert.match(limitMessage({ allowed: false, scope: "burst", retryAfterSec: 42 }), /42초/);
  assert.notEqual(
    limitMessage({ allowed: false, scope: "ip", retryAfterSec: 0 }),
    limitMessage({ allowed: false, scope: "global", retryAfterSec: 0 }),
  );
  assert.ok(limitMessage({ allowed: false, scope: "store", retryAfterSec: 60 }).length > 0);
});
