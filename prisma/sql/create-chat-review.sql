-- 챗봇 자동 점검 루프 테이블 2종 (db push 금지 정책 — raw SQL 직접 실행).
-- ChatReview  : 하루(KST) 단위 채점 결과 — 분류 집계·반복 수요·사례를 JSON 으로.
-- ChatbotRule : 채점기가 제안한 챗봇 행동 규칙. 관리자가 승인(ACTIVE)해야 시스템 프롬프트에 들어간다.
--
-- 운영 적용:
--   npx prisma db execute --file prisma/sql/create-chat-review.sql
--   npx prisma generate
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "ChatReview" (
    "id"        SERIAL       NOT NULL,
    "day"       TEXT         NOT NULL,
    "total"     INTEGER      NOT NULL DEFAULT 0,
    "answered"  INTEGER      NOT NULL DEFAULT 0,
    "reasked"   INTEGER      NOT NULL DEFAULT 0,
    "failed"    INTEGER      NOT NULL DEFAULT 0,
    "suspect"   INTEGER      NOT NULL DEFAULT 0,
    "detail"    JSONB        NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatReview_day_key" ON "ChatReview"("day");

CREATE TABLE IF NOT EXISTS "ChatbotRule" (
    "id"        SERIAL       NOT NULL,
    "text"      TEXT         NOT NULL,
    "reason"    TEXT         NOT NULL DEFAULT '',
    "examples"  JSONB        NOT NULL DEFAULT '[]',
    "status"    TEXT         NOT NULL DEFAULT 'PROPOSED',
    "sourceDay" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ChatbotRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatbotRule_status_idx" ON "ChatbotRule"("status");
