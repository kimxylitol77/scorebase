-- MatchVote 시장 확장 — 핸디캡·오버언더 투표 (2026-09-10)
-- 실행: prisma db push 금지 관례 — Neon 에 직접. lock_timeout 으로 프로덕션 락 대기 차단.
SET lock_timeout = '3s';
ALTER TABLE "MatchVote" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT '1X2';
ALTER TABLE "MatchVote" ADD COLUMN IF NOT EXISTS "line" DOUBLE PRECISION;
DROP INDEX IF EXISTS "MatchVote_matchId_userId_key";
DROP INDEX IF EXISTS "MatchVote_matchId_sessionId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MatchVote_matchId_userId_market_key" ON "MatchVote" ("matchId", "userId", "market");
CREATE UNIQUE INDEX IF NOT EXISTS "MatchVote_matchId_sessionId_market_key" ON "MatchVote" ("matchId", "sessionId", "market");
