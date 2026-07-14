-- PlayerEvent 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- prisma migrate diff 로 생성. 새 빈 테이블이라 기존 테이블 락 없음.
CREATE TABLE "PlayerEvent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB,
    "matchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayerEvent_playerId_occurredAt_idx" ON "PlayerEvent"("playerId", "occurredAt");
