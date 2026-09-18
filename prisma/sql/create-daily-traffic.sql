-- DailyTraffic 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- /admin/stats 일별 방문자 표와 오늘·어제 KPI 의 단일 출처. 봇·위장 스크레이퍼를 뺀 하루치 사람 방문자·PV
-- (lib/traffic-filter dailyCleanStats). cron daily-traffic 이 매일 00:10 KST 에 어제·그제분을 upsert.
-- 과거분은 scripts/backfill-daily-traffic.ts 로 채운다.
--
-- 운영 적용 (2026-09-18 적용 완료):
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/create-daily-traffic.sql
--   npx prisma generate
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "DailyTraffic" (
    "day"       TEXT         NOT NULL,
    "visitors"  INTEGER      NOT NULL,
    "pv"        INTEGER      NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyTraffic_pkey" PRIMARY KEY ("day")
);
