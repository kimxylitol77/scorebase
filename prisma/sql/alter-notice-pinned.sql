-- Notice.pinned — 고정 공지(가이드 페이지). 운영 DB 에 2026-09-11 적용 완료. db push 금지, raw SQL 로만.
SET lock_timeout = '3s';
ALTER TABLE "Notice" ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN NOT NULL DEFAULT false;
