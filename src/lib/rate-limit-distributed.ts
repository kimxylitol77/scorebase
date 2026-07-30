// 분산 rate limit — Neon Postgres 카운터로 serverless 인스턴스 간 한도를 공유한다.
//
// 왜 in-memory(@/lib/rate-limit) 로는 안 되나.
//   Vercel 은 요청마다 다른 인스턴스가 뜰 수 있고 콜드 스타트마다 Map 이 비어 있다.
//   즉 "5분에 15회" 가 실제로는 인스턴스 수만큼 곱해진다 — 공개 챗봇에선 그대로 과금 사고.
//
// 정책.
//   1) IP 버스트 — 5분에 N회
//   2) IP 일일  — 24시간에 N회
//   3) 전체 일일 — 24시간에 N회 (한 사람이 IP 를 바꿔가며 태우는 것 방어)
//   4) fail-closed — 카운터 저장소가 죽으면 무제한 허용이 아니라 차단한다.
//      "저장소 장애 = 방어 없음" 이 되면 공격자는 DB 를 흔들어 한도를 없앨 수 있다.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LimitScope = "burst" | "ip" | "global" | "store";

export interface DistributedLimitResult {
  allowed: boolean;
  /** 막혔을 때 어느 한도에 걸렸는지. store = 저장소 장애(fail-closed). */
  scope: LimitScope | null;
  retryAfterSec: number;
}

/** 카운터 저장소 — 테스트에서 갈아끼울 수 있게 분리한다. */
export interface CounterStore {
  /**
   * key 를 1 증가시키고 증가 후 값을 돌려준다.
   * windowStart 가 windowMs 를 넘겼으면 1 로 리셋한다. 원자적이어야 한다.
   */
  bump(key: string, windowMs: number, now: Date): Promise<{ count: number; windowStart: Date }>;
}

/** Postgres upsert 한 방으로 증가 + 창 만료 리셋을 원자적으로 처리한다. */
export const postgresCounterStore: CounterStore = {
  async bump(key, windowMs, now) {
    const expiredBefore = new Date(now.getTime() - windowMs);
    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>(Prisma.sql`
      INSERT INTO "RateLimitCounter" ("key", "count", "windowStart", "updatedAt")
      VALUES (${key}, 1, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitCounter"."windowStart" <= ${expiredBefore}
                       THEN 1 ELSE "RateLimitCounter"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimitCounter"."windowStart" <= ${expiredBefore}
                             THEN ${now} ELSE "RateLimitCounter"."windowStart" END,
        "updatedAt" = ${now}
      RETURNING "count", "windowStart"
    `);
    const row = rows[0];
    if (!row) throw new Error("RateLimitCounter upsert 가 행을 돌려주지 않음");
    return { count: Number(row.count), windowStart: new Date(row.windowStart) };
  },
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export interface QuotaPolicy {
  burstMax: number;
  burstWindowMs: number;
  ipDailyMax: number;
  globalDailyMax: number;
}

/** 챗봇 기본 정책 — 1회 대화가 Claude 호출 최대 5회(도구 루프)라 상한을 보수적으로 잡는다. */
export const CHAT_QUOTA: QuotaPolicy = {
  burstMax: 15,
  burstWindowMs: 5 * MINUTE,
  ipDailyMax: 100,
  globalDailyMax: 3000,
};

const ALLOWED: DistributedLimitResult = { allowed: true, scope: null, retryAfterSec: 0 };

function blocked(scope: LimitScope, windowStart: Date, windowMs: number, now: Date): DistributedLimitResult {
  const resetAt = windowStart.getTime() + windowMs;
  return {
    allowed: false,
    scope,
    retryAfterSec: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/**
 * 챗봇 1회 요청분의 할당량을 소모한다.
 * 한도 초과는 물론 저장소 장애에서도 allowed=false (fail-closed).
 */
export async function consumeChatQuota(
  ip: string,
  opts?: { store?: CounterStore; policy?: QuotaPolicy; now?: Date; namespace?: string },
): Promise<DistributedLimitResult> {
  const store = opts?.store ?? postgresCounterStore;
  const policy = opts?.policy ?? CHAT_QUOTA;
  const now = opts?.now ?? new Date();
  const ns = opts?.namespace ?? "chat";

  try {
    // 전체 한도를 먼저 본다 — 사이트 전체 예산이 이미 소진됐으면 IP 카운터를 늘릴 이유가 없다.
    const global = await store.bump(`${ns}:global`, DAY, now);
    if (global.count > policy.globalDailyMax) {
      return blocked("global", global.windowStart, DAY, now);
    }

    const burst = await store.bump(`${ns}:burst:${ip}`, policy.burstWindowMs, now);
    if (burst.count > policy.burstMax) {
      return blocked("burst", burst.windowStart, policy.burstWindowMs, now);
    }

    const daily = await store.bump(`${ns}:ip:${ip}`, DAY, now);
    if (daily.count > policy.ipDailyMax) {
      return blocked("ip", daily.windowStart, DAY, now);
    }

    return ALLOWED;
  } catch (err) {
    // fail-closed. 무제한 허용이 아니라 차단이 기본값이다.
    console.error("[rate-limit] 카운터 저장소 장애 — 차단", err);
    return { allowed: false, scope: "store", retryAfterSec: 60 };
  }
}

/** 사용자에게 보여줄 한 줄 안내 — 어느 한도에 걸렸는지에 따라 문구가 다르다. */
export function limitMessage(result: DistributedLimitResult): string {
  switch (result.scope) {
    case "burst":
      return `요청이 너무 많습니다. ${result.retryAfterSec}초 후 다시 시도하세요.`;
    case "ip":
      return "오늘 사용 가능한 질문 수를 모두 쓰셨어요. 내일 다시 이용해 주세요.";
    case "global":
      return "오늘 챗봇 이용량이 한도에 도달했어요. 내일 다시 이용해 주세요.";
    default:
      return "지금은 요청을 받을 수 없어요. 잠시 후 다시 시도해 주세요.";
  }
}
