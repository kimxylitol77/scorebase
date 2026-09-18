-- DailyTraffic 에 의심 세션 수 컬럼 추가 — 스크레이퍼 급증 알림(lib/admin/scraper-surge)이 직전 14일 중앙값과 비교한다.
--
-- 운영 적용 (2026-09-18 적용 완료):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/alter-daily-traffic-suspicious.sql
--   npx prisma generate
-- 과거분 채우기: scripts/backfill-daily-traffic.ts
--
-- 132행짜리 작은 테이블이라 락 영향 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

ALTER TABLE "DailyTraffic" ADD COLUMN IF NOT EXISTS "suspicious" INTEGER NOT NULL DEFAULT 0;
