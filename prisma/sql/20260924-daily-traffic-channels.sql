-- DailyTraffic.channels 추가 (db push 금지 정책 — raw SQL 직접 실행). 2026-09-24 운영 적용 완료.
-- 그날 판정(traffic-filter dailyCleanStats)을 통과한 사람 랜딩의 채널별 수 {channel: {count, unique}}.
-- admin/stats 유입 채널 막대·지난주 대비가 이 일별값을 합산한다(원본 랜딩 take 잘림 사고 대체).
--
-- 운영 적용:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/20260924-daily-traffic-channels.sql
--   npx prisma generate
--   npx tsx scripts/backfill-daily-traffic.ts 2026-06-11   (랜딩 기록 시작일부터 채움)
--
-- nullable 컬럼 추가라 메타데이터 변경만 — 관례대로 lock_timeout 을 짧게 건다.
SET lock_timeout = '3s';
ALTER TABLE "DailyTraffic" ADD COLUMN IF NOT EXISTS "channels" JSONB;
