// 캐시 single-flight 회귀 테스트 — 동시 호출이 쿼리를 한 번만 내는지.
//
// 2026-07-31 배포 실패(dpl_4bkRyS9g): 완료된 값만 캐싱했더니 캐시가 비어 있는 동안 들어온
// 동시 호출이 전부 캐시를 놓치고 각자 쿼리를 날렸다. 빌드 프리렌더가 페이지를 동시에 그려
// Neon 커넥션 풀(5)이 말라 배포가 통째로 죽었다. 여기서 그 패턴 자체를 고정한다.
//
// season-registry 는 prisma 를 물고 있어 단위 테스트에서 못 부른다 — 같은 캐시 패턴을
// 재현해 검증한다. 구현을 바꾸면 이 파일도 같이 봐야 한다는 뜻이다.
import { test } from "node:test";
import assert from "node:assert/strict";

const TTL_MS = 60 * 1000;

/** season-registry.loadActive 와 같은 구조 — 진행 중 Promise 를 캐싱한다. */
function makeSingleFlight<T>(fetcher: () => Promise<T>, nowFn: () => number) {
  let cache: { at: number; value: Promise<T> } | null = null;
  return {
    get(): Promise<T> {
      const now = nowFn();
      if (cache && now - cache.at < TTL_MS) return cache.value;
      const p = fetcher();
      cache = { at: now, value: p };
      return p;
    },
    invalidate() {
      cache = null;
    },
  };
}

test("동시 호출 20건이 쿼리를 한 번만 낸다", async () => {
  let calls = 0;
  const sf = makeSingleFlight(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return "rows";
  }, () => 0);

  const results = await Promise.all(Array.from({ length: 20 }, () => sf.get()));
  assert.equal(calls, 1, "동시 호출이 각자 쿼리를 내면 커넥션 풀이 마른다");
  assert.deepEqual(new Set(results), new Set(["rows"]));
});

test("TTL 안에서는 재호출해도 쿼리가 늘지 않는다", async () => {
  let calls = 0;
  let now = 0;
  const sf = makeSingleFlight(async () => {
    calls++;
    return calls;
  }, () => now);

  await sf.get();
  now = TTL_MS - 1;
  await sf.get();
  assert.equal(calls, 1);
});

test("TTL 이 지나면 다시 조회한다", async () => {
  let calls = 0;
  let now = 0;
  const sf = makeSingleFlight(async () => {
    calls++;
    return calls;
  }, () => now);

  await sf.get();
  now = TTL_MS + 1;
  await sf.get();
  assert.equal(calls, 2);
});

test("실패한 조회도 캐싱해 재시도 폭주를 막는다", async () => {
  let calls = 0;
  // 구현은 내부에서 catch 해 빈 결과를 돌려주므로 reject 가 새지 않는다.
  const sf = makeSingleFlight(async () => {
    calls++;
    try {
      throw new Error("pool timeout");
    } catch {
      return "empty";
    }
  }, () => 0);

  const results = await Promise.all(Array.from({ length: 10 }, () => sf.get()));
  assert.equal(calls, 1, "실패해도 동시 호출이 각자 재시도하면 풀이 더 마른다");
  assert.deepEqual(new Set(results), new Set(["empty"]));
});

test("무효화하면 다음 호출이 다시 조회한다", async () => {
  let calls = 0;
  const sf = makeSingleFlight(async () => ++calls, () => 0);
  await sf.get();
  sf.invalidate();
  await sf.get();
  assert.equal(calls, 2);
});
