// api-football 일일 쿼터 가드 — 잔량이 얼마 안 남으면 비핵심 잡이 스스로 물러난다.
//
// 2026-08-09 사고: 하루 한도 75,000 중 74,234 를 오전에 소진해 라이브 수집까지 끊길 뻔했다.
// 소비처가 여러 cron 에 흩어져 있어 하나를 끄는 것으로는 재발을 못 막는다. 그래서 호출 직전에
// 잔량을 보고, 급하지 않은 잡부터 순서대로 포기시킨다.
//
// /status 는 쿼터를 소모하지 않는다(af 공식) — 그래서 가드 자체는 비용이 없다.

const STATUS_URL = "https://v3.football.api-sports.io/status";
const CACHE_MS = 5 * 60 * 1000;

/** 잡의 급함 정도. 숫자가 클수록 더 많은 잔량을 요구한다(= 먼저 포기한다). */
export const AF_TIER = {
  /** 라이브·당일 매치 수집, 예측 — 끊기면 사이트가 즉시 틀려진다 */
  core: 200,
  /** 순위·부상자 등 하루 늦어도 되는 갱신 */
  normal: 2_000,
  /** 선수 트로피·등번호·이적 등 며칠 밀려도 되는 축적성 데이터 */
  optional: 8_000,
} as const;

export type AfTier = keyof typeof AF_TIER;

let cache: { at: number; remaining: number } | null = null;

/** 남은 호출 수. 조회 실패 시 null — 그 경우 가드는 통과시킨다(가드가 수집을 죽이면 안 된다). */
export async function afRemaining(): Promise<number | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.remaining;
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const r = await fetch(STATUS_URL, {
      headers: { "x-apisports-key": key },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      response?: { requests?: { current?: number; limit_day?: number } };
    };
    const cur = j.response?.requests?.current;
    const lim = j.response?.requests?.limit_day;
    if (typeof cur !== "number" || typeof lim !== "number") return null;
    const remaining = Math.max(0, lim - cur);
    cache = { at: now, remaining };
    return remaining;
  } catch {
    return null;
  }
}

/**
 * 이 tier 의 작업을 지금 돌려도 되는가.
 * 잔량을 못 읽으면 true — 가드 때문에 정상 수집이 멈추는 쪽이 더 나쁘다.
 */
export async function afQuotaOk(tier: AfTier): Promise<boolean> {
  const remaining = await afRemaining();
  if (remaining === null) return true;
  return remaining >= AF_TIER[tier];
}

/** 라우트에서 쓰는 짧은 형태 — 막혔으면 사유 문자열, 통과면 null. */
export async function afQuotaBlock(tier: AfTier): Promise<string | null> {
  const remaining = await afRemaining();
  if (remaining === null) return null;
  if (remaining >= AF_TIER[tier]) return null;
  return `af-quota-low (remaining ${remaining} < ${AF_TIER[tier]})`;
}
