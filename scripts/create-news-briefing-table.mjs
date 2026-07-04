// NewsBriefing 테이블 prod 생성 — raw SQL (db push 금지 원칙).
// 실행 전 장기 트랜잭션 확인 + lock_timeout 3s (prod DDL 락 사고 재발 방지 절차).
// 실행: node --env-file=.env.local scripts/create-news-briefing-table.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const longTx = await prisma.$queryRawUnsafe(`
  SELECT pid, now() - xact_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
  WHERE state <> 'idle' AND xact_start < now() - interval '30 seconds'
`);
if (longTx.length > 0) {
  console.error("장기 트랜잭션 발견 — DDL 중단. 먼저 확인하세요:", longTx);
  process.exit(1);
}

await prisma.$executeRawUnsafe(`SET lock_timeout = '3s'`);
await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "NewsBriefing" (
    "id"          TEXT PRIMARY KEY,
    "title"       TEXT NOT NULL,
    "sourceName"  TEXT NOT NULL,
    "sourceUrl"   TEXT NOT NULL,
    "journalist"  TEXT,
    "tier"        INTEGER NOT NULL DEFAULT 1,
    "category"    TEXT,
    "league"      TEXT,
    "titleKo"     TEXT,
    "bodyKo"      TEXT,
    "status"      TEXT NOT NULL DEFAULT 'SEEN',
    "note"        TEXT,
    "postId"      INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await prisma.$executeRawUnsafe(
  `ALTER TABLE "NewsBriefing" ADD COLUMN IF NOT EXISTS "storyKey" TEXT`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "NewsBriefing_status_createdAt_idx" ON "NewsBriefing"("status", "createdAt")`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "NewsBriefing_createdAt_idx" ON "NewsBriefing"("createdAt")`,
);
console.log("NewsBriefing 테이블 생성 완료");
await prisma.$disconnect();
