-- DraftGame 테이블 생성 (농구 블라인드 드래프트).
-- 운영 DB 와 Prisma schema 사이의 기존 drift 때문에 db push 를 쓰지 않고 새 빈 테이블과 인덱스만 추가한다.
-- 기존 테이블을 건드리지 않으므로(FK 없음) 다른 쿼리를 막지 않는다. 그래도 lock_timeout 을 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "DraftGame" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "nickname" TEXT,
    "state" JSONB NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "total" DOUBLE PRECISION,
    "percentile" INTEGER,
    "rings" INTEGER,
    "lineup" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DraftGame_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DraftGame_mode_done_total_idx" ON "DraftGame"("mode", "done", "total");
CREATE INDEX IF NOT EXISTS "DraftGame_mode_finishedAt_idx" ON "DraftGame"("mode", "finishedAt");
CREATE INDEX IF NOT EXISTS "DraftGame_sessionId_idx" ON "DraftGame"("sessionId");
