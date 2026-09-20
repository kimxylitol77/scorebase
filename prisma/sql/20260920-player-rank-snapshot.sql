-- /transfers 랭킹 순위 일별 스냅샷 — 순위 변동 화살표 기준선 (2026-09-20)
-- 신규 테이블이라 기존 테이블 락 없음. 프로덕션에는 prisma db push 로 이미 적용됨(2026-09-20), 기록용.
CREATE TABLE IF NOT EXISTS "PlayerRankSnapshot" (
  "id"       SERIAL PRIMARY KEY,
  "list"     TEXT NOT NULL,
  "day"      DATE NOT NULL,
  "playerId" TEXT NOT NULL,
  "rank"     INTEGER NOT NULL,
  "league"   TEXT,
  "posCode"  TEXT,
  "score"    DOUBLE PRECISION
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerRankSnapshot_list_day_playerId_key" ON "PlayerRankSnapshot"("list", "day", "playerId");
CREATE INDEX IF NOT EXISTS "PlayerRankSnapshot_list_day_idx" ON "PlayerRankSnapshot"("list", "day");
