-- SnsEmbed — 인증샷 모음(/community/proof)용 SNS 글 주소. 운영 DB 에 2026-09-30 적용. db push 금지, raw SQL 로만.
SET lock_timeout = '3s';
CREATE TABLE IF NOT EXISTS "SnsEmbed" (
  "id" SERIAL PRIMARY KEY,
  "platform" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "SnsEmbed_url_key" ON "SnsEmbed"("url");
CREATE INDEX IF NOT EXISTS "SnsEmbed_hidden_createdAt_idx" ON "SnsEmbed"("hidden", "createdAt");
