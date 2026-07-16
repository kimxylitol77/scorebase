-- 텔레그램 경기 알림 — DB 마이그레이션 (Neon SQL 에디터에서 실행).
-- 모두 additive: nullable 컬럼 + 신규 테이블 → 기존 행/가입 안전. (db push 대신 수동 적용)

-- 1) User 텔레그램 연결 필드 (nullable)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramLinkToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key" ON "User"("telegramChatId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramLinkToken_key" ON "User"("telegramLinkToken");

-- 2) 즐겨찾기 팀
CREATE TABLE IF NOT EXISTS "UserTeamFollow" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTeamFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserTeamFollow_userId_teamId_key" ON "UserTeamFollow"("userId","teamId");
CREATE INDEX IF NOT EXISTS "UserTeamFollow_teamId_idx" ON "UserTeamFollow"("teamId");
ALTER TABLE "UserTeamFollow" ADD CONSTRAINT "UserTeamFollow_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) 알림 중복 발송 방지 로그
CREATE TABLE IF NOT EXISTS "TelegramAlertLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAlertLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramAlertLog_userId_matchId_kind_key" ON "TelegramAlertLog"("userId","matchId","kind");
CREATE INDEX IF NOT EXISTS "TelegramAlertLog_sentAt_idx" ON "TelegramAlertLog"("sentAt");
