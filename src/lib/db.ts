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

// Next.js dev mode 핫리로드 시 다중 PrismaClient 생성을 방지
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof withRetry> | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  withRetry(
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }),
  );

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
