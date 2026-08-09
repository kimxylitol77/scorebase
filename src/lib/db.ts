import { PrismaClient } from "@prisma/client";

// 연결성 에러(Neon serverless 의 auto-suspend cold start·일시 연결 끊김)로 실패한 쿼리를
// 지수 백오프로 자동 재시도한다. 빌드 타임 prerender 가 잠든 Neon 을 동시에 깨울 때 첫 연결이
// 실패해도 흡수 → 빌드 abort(배포 실패) 방지. 런타임의 일시적 연결 끊김도 함께 완화.
// (2026-07-23: /embed/wc-bracket 빌드 실패로 배포 누락 반복 → 근본 대책. 메모리 build-neon-connection-failure)
const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function isRetryable(e: unknown): boolean {
  const err = e as { name?: string; code?: string; errorCode?: string; message?: string };
  // PrismaClientInitializationError = DB 도달 불가(연결 초기화 실패) — errorCode 가 undefined 로
  // 오는 경우가 있어(실측) 이름으로도 판별.
  if (err?.name === "PrismaClientInitializationError") return true;
  const code = err?.code ?? err?.errorCode;
  if (code && RETRYABLE_CODES.has(code)) return true;
  return /can't reach database|connection refused|timed out|econnrefused|connection closed|server has closed/i.test(
    err?.message ?? "",
  );
}

function withRetry(base: PrismaClient) {
  return base.$extends({
    name: "neon-connection-retry",
    query: {
      async $allOperations({ args, query }) {
        const MAX = 4;
        let lastErr: unknown;
        for (let attempt = 0; attempt < MAX; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            if (attempt === MAX - 1 || !isRetryable(e)) throw e;
            lastErr = e;
            // 0.4s → 0.8s → 1.6s (Neon cold start ~수백ms~수초 흡수)
            await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
          }
        }
        throw lastErr;
      },
    },
  });
}

// POSTPONED 매치에 스코어가 쓰이는 유입 경로 추적 (2026-08-09, KBO #2499 0-0 사고).
// 연기 경기는 정의상 스코어가 없어야 하는데 어떤 경로가 0-0 을 쓴 채 status 를 POSTPONED 로
// 남겼다 — 사후에는 updatedAt 밖에 단서가 없어 원인 특정 불가. 그래서 쓰기 시점에 잡는다.
// 스코어를 쓰는 update/updateMany/upsert 직후 결과 row 가 POSTPONED+스코어 조합으로 남았으면
// 호출 스택을 [postponed-score-write] 태그로 로그 — Vercel/워커 로그에서 태그 검색으로 경로 특정.
// 검사는 fire-and-forget 이라 응답 지연 없음. 검사 쿼리는 base 클라이언트로 직접 (재귀 방지).
function toScoreValue(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { set?: unknown }).set === "number") {
    return (v as { set: number }).set;
  }
  return null;
}

function writesScore(data: unknown): boolean {
  const d = data as { homeScore?: unknown; awayScore?: unknown; status?: unknown } | undefined;
  if (!d) return false;
  // status 만 POSTPONED 로 바꾸는 쓰기도 검사 — 라이브 중 쓰인 스코어가 남은 채 연기 전이하는
  // 시퀀스(ABD 중단 경기 실측 3건)가 잔존을 만든다. 스코어를 안 쓰는 쓰기라도 결과가 오염일 수 있다.
  const statusValue =
    typeof d.status === "string"
      ? d.status
      : d.status && typeof d.status === "object" && typeof (d.status as { set?: unknown }).set === "string"
        ? (d.status as { set: string }).set
        : null;
  if (statusValue === "POSTPONED") return true;
  // status 를 POSTPONED 밖으로 옮기는 쓰기는 정상 (재개·종료 전이) — 검사 생략.
  if (statusValue != null) return false;
  return toScoreValue(d.homeScore) != null || toScoreValue(d.awayScore) != null;
}

function tracePostponedScoreWrite(base: PrismaClient, where: unknown, stack: string | undefined) {
  base.match
    .findMany({
      where: {
        AND: [
          where as object,
          { status: "POSTPONED", OR: [{ homeScore: { not: null } }, { awayScore: { not: null } }] },
        ],
      },
      select: { id: true, league: true, externalId: true, homeScore: true, awayScore: true },
      take: 10,
    })
    .then((rows) => {
      if (rows.length === 0) return;
      const summary = rows
        .map((r) => `#${r.id} ${r.league} ext=${r.externalId} ${r.homeScore}-${r.awayScore}`)
        .join(" / ");
      // 스택 앞머리(Error 줄 제외)만 — 유입 경로 파일:라인 특정에 충분
      const frames = (stack ?? "").split("\n").slice(1, 8).join("\n");
      console.warn(`[postponed-score-write] POSTPONED 매치에 스코어 잔존: ${summary}\n${frames}`);
    })
    .catch(() => {
      /* 추적 실패는 본 쓰기에 영향 주지 않음 */
    });
}

function withPostponedScoreTracer<T extends { $extends: PrismaClient["$extends"] }>(
  client: T,
  base: PrismaClient,
) {
  return client.$extends({
    name: "postponed-score-tracer",
    query: {
      match: {
        async update({ args, query }) {
          const hot = writesScore(args.data);
          const stack = hot ? new Error("trace").stack : undefined;
          const result = await query(args);
          if (hot) tracePostponedScoreWrite(base, args.where, stack);
          return result;
        },
        async updateMany({ args, query }) {
          const hot = writesScore(args.data);
          const stack = hot ? new Error("trace").stack : undefined;
          const result = await query(args);
          if (hot) tracePostponedScoreWrite(base, args.where, stack);
          return result;
        },
        async upsert({ args, query }) {
          const hot = writesScore(args.update) || writesScore(args.create);
          const stack = hot ? new Error("trace").stack : undefined;
          const result = await query(args);
          if (hot) tracePostponedScoreWrite(base, args.where, stack);
          return result;
        },
      },
    },
  });
}

function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  return withPostponedScoreTracer(withRetry(base), base);
}

// Next.js dev mode 핫리로드 시 다중 PrismaClient 생성을 방지
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof buildClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
