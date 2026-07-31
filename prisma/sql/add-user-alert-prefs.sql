-- User 알림 종류별 수신 설정 컬럼 추가.
-- 운영 DB 와 Prisma schema 사이의 기존 drift 때문에 db push 를 쓰지 않고 필요한 컬럼만 추가한다.
-- NOT NULL + DEFAULT 는 Postgres 11+ 에서 테이블 재작성 없이 메타데이터만 바꾼다.
-- 실행 전 장기 트랜잭션 확인 (prod DDL 락 사고 재발 방지):
--   SELECT pid, state, age(clock_timestamp(), xact_start) FROM pg_stat_activity
--    WHERE xact_start IS NOT NULL ORDER BY 3 DESC LIMIT 5;
SET lock_timeout = '3s';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "alertKickoff"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertLineup"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertGoal"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertFinal"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertFollowPick" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertOddsAll"    BOOLEAN NOT NULL DEFAULT false;
