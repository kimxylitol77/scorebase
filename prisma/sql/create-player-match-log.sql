-- PlayerMatchLog 테이블 생성 (db push 금지 — raw SQL 직접 실행).
-- prisma migrate diff 로 생성. 새 빈 테이블이라 기존 테이블 락 없음.
CREATE TABLE "PlayerMatchLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "leagueName" TEXT NOT NULL,
    "leagueFlag" TEXT,
    "homeName" TEXT NOT NULL,
    "homeLogo" TEXT,
    "awayName" TEXT NOT NULL,
    "awayLogo" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "playerSide" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "minutes" INTEGER,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "yellow" INTEGER NOT NULL DEFAULT 0,
    "red" INTEGER NOT NULL DEFAULT 0,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMatchLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlayerMatchLog_playerId_date_idx" ON "PlayerMatchLog"("playerId", "date");
