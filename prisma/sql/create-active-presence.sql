-- ActivePresence 테이블 생성.
-- 운영 DB와 Prisma schema 사이의 기존 drift 때문에 db push를 사용하지 않고,
-- 실시간 접속 통계에 필요한 새 빈 테이블과 인덱스만 안전하게 추가한다.
CREATE TABLE IF NOT EXISTS "ActivePresence" (
    "tabId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "host" TEXT,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivePresence_pkey" PRIMARY KEY ("tabId")
);

CREATE INDEX IF NOT EXISTS "ActivePresence_lastSeenAt_idx"
    ON "ActivePresence"("lastSeenAt");
CREATE INDEX IF NOT EXISTS "ActivePresence_sessionId_lastSeenAt_idx"
    ON "ActivePresence"("sessionId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "ActivePresence_section_lastSeenAt_idx"
    ON "ActivePresence"("section", "lastSeenAt");
