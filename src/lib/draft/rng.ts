// 드래프트 게임용 시드 난수 — 같은 시드·같은 순번이면 항상 같은 판이 나온다
export type Rng = () => number;

/** mulberry32 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 게임 시드와 뽑기 순번을 섞어 판마다 독립된 난수열을 만든다 */
export function rngFor(seed: number, nonce: number): Rng {
  return makeRng((seed ^ Math.imul(nonce + 1, 0x9e3779b1)) >>> 0);
}

export function pickOne<T>(rng: Rng, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)];
}

/** 가중치 비복원 추출 */
export function weightedSample<T>(rng: Rng, xs: T[], weight: (x: T) => number, n: number): T[] {
  const pool = xs.map((x) => ({ x, w: Math.max(weight(x), 0.0001) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    out.push(pool[i].x);
    pool.splice(i, 1);
  }
  return out;
}
