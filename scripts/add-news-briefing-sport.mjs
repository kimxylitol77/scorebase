// NewsBriefing.sport 컬럼 추가 — raw SQL (db push 금지 원칙).
// 종목 확장(야구·농구·하키) 전 선행 DDL. 기존 행은 전부 축구라 DEFAULT 'soccer'.
// 실행 전 장기 트랜잭션 확인 + lock_timeout 3s (prod DDL 락 사고 재발 방지 절차).
// 실행: node --env-file=.env.local scripts/add-news-briefing-sport.mjs
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
await prisma.$executeRawUnsafe(
  `ALTER TABLE "NewsBriefing" ADD COLUMN IF NOT EXISTS "sport" TEXT NOT NULL DEFAULT 'soccer'`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "NewsBriefing_sport_status_idx" ON "NewsBriefing" ("sport", "status")`,
);

const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name, data_type, column_default FROM information_schema.columns
   WHERE table_name = 'NewsBriefing' AND column_name = 'sport'`,
);
console.log("적용 결과:", cols);
await prisma.$disconnect();
