-- 베트맨 배당 변동 이력(BetmanOddsChange) + BetmanOdds.mchScore(판정 스코어) — 2026-09-21. db push 금지, raw 로 적용.
-- 실행 전 장기 트랜잭션 확인(prod-ddl-lock-incident). 적용은 scripts/apply-betman-change-ddl.mjs.
SET lock_timeout = '3s';

ALTER TABLE "BetmanOdds" ADD COLUMN IF NOT EXISTS "mchScore" TEXT;

CREATE TABLE IF NOT EXISTS "BetmanOddsChange" (
  "id"              TEXT PRIMARY KEY,           -- "{gmTs}-{matchSeq}-{CHG_DTM 14자리}"
  "gmTs"            INTEGER NOT NULL,
  "matchSeq"        INTEGER NOT NULL,
  "changedAt"       TIMESTAMP(3) NOT NULL,      -- CHG_DTM(KST) → UTC
  "beforeWin"       DOUBLE PRECISION,
  "afterWin"        DOUBLE PRECISION,
  "beforeDraw"      DOUBLE PRECISION,
  "afterDraw"       DOUBLE PRECISION,
  "beforeLose"      DOUBLE PRECISION,
  "afterLose"       DOUBLE PRECISION,
  "beforeWinHandi"  DOUBLE PRECISION,
  "afterWinHandi"   DOUBLE PRECISION,
  "beforeLoseHandi" DOUBLE PRECISION,
  "afterLoseHandi"  DOUBLE PRECISION,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BetmanOddsChange_gmTs_matchSeq_idx" ON "BetmanOddsChange"("gmTs", "matchSeq");
