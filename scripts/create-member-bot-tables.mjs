// MemberBot·MemberBotPick 테이블 prod 생성 — raw SQL (db push 금지 원칙, NewsBriefing 전례).
// 실행 전 장기 트랜잭션 확인 + lock_timeout 3s (prod DDL 락 사고 재발 방지 절차).
// 신규 CREATE TABLE 만 — 기존 테이블 락 없음. kimss 명시 승인 후에만 실행.
// 실행: node --env-file=.env.local scripts/create-member-bot-tables.mjs
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
  CREATE TABLE IF NOT EXISTS "MemberBot" (
    "id"            TEXT PRIMARY KEY,
    "userId"        TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "league"        TEXT NOT NULL DEFAULT 'ALL',
    "knobs"         JSONB NOT NULL,
    "backtestCache" JSONB,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "MemberBot_userId_idx" ON "MemberBot"("userId")`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "MemberBot_isActive_idx" ON "MemberBot"("isActive")`,
);

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "MemberBotPick" (
    "id"        SERIAL PRIMARY KEY,
    "botId"     TEXT NOT NULL,
    "matchId"   INTEGER NOT NULL,
    "market"    TEXT NOT NULL DEFAULT '1X2',
    "pick"      TEXT NOT NULL,
    "prob"      DOUBLE PRECISION NOT NULL,
    "correct"   BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberBotPick_botId_fkey"
      FOREIGN KEY ("botId") REFERENCES "MemberBot"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  )
`);
await prisma.$executeRawUnsafe(
  `CREATE UNIQUE INDEX IF NOT EXISTS "MemberBotPick_botId_matchId_market_key" ON "MemberBotPick"("botId", "matchId", "market")`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "MemberBotPick_botId_correct_idx" ON "MemberBotPick"("botId", "correct")`,
);
await prisma.$executeRawUnsafe(
  `CREATE INDEX IF NOT EXISTS "MemberBotPick_matchId_idx" ON "MemberBotPick"("matchId")`,
);

console.log("MemberBot · MemberBotPick 테이블 생성 완료");
await prisma.$disconnect();
