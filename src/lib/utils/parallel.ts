/**
 * 제한된 동시성으로 비동기 작업을 실행.
 * Promise.all 처럼 한 번에 폭주시키지 않고 worker N개로 큐를 소비한다.
 * DB write/외부 API 호출 등 connection pool 한도가 있는 작업에 사용.
 */
export async function runParallel<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const workers = Math.min(concurrency, items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= items.length) return;
        await fn(items[i], i);
      }
    }),
  );
}
