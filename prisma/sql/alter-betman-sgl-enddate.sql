-- BetmanOdds.sgl(단폭 가능)·endDate(발매 마감) — 운영 DB 2026-09-12 적용 완료. db push 금지.
SET lock_timeout = '3s';
ALTER TABLE "BetmanOdds" ADD COLUMN IF NOT EXISTS "sgl" BOOLEAN, ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
