-- KboPlayerGameLog 테이블 생성 (db push 금지 — raw SQL 직접 실행).
-- KBO 경기별 선수 로그 아카이브 — koreabaseball.com Daily.aspx 스크래핑 축적.
-- 새 빈 테이블이라 기존 테이블 락 없음.
CREATE TABLE IF NOT EXISTS "KboPlayerGameLog" (
    "id" TEXT NOT NULL,
    "kboId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "team" TEXT,
    "opponent" TEXT NOT NULL,
    "roleDetail" TEXT,
    "result" TEXT,
    "ip" TEXT,
    "tbf" INTEGER,
    "er" INTEGER,
    "gameEra" DOUBLE PRECISION,
    "cumEra" DOUBLE PRECISION,
    "pa" INTEGER,
    "ab" INTEGER,
    "d2b" INTEGER,
    "d3b" INTEGER,
    "rbi" INTEGER,
    "sb" INTEGER,
    "gameAvg" DOUBLE PRECISION,
    "cumAvg" DOUBLE PRECISION,
    "h" INTEGER,
    "hr" INTEGER,
    "bb" INTEGER,
    "so" INTEGER,
    "r" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KboPlayerGameLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KboPlayerGameLog_kboId_season_idx" ON "KboPlayerGameLog"("kboId", "season");
