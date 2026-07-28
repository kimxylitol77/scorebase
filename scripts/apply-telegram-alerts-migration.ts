// docs/telegram-alerts/migration.sql 섹션 4·5 적용 (즐겨찾기 경기 알림 + 배당 변동 옵트인).
// 전부 additive·멱등(IF NOT EXISTS) — 재실행 안전. lock_timeout 으로 prod 락 대기 차단.
import { prisma } from "../src/lib/db";

const STMTS = [
  `SET lock_timeout = '3s'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "alertOddsDrop" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "alertOddsRise" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "UserMatchFollow" (
     "id" TEXT NOT NULL,
     "matchId" INTEGER NOT NULL,
     "userId" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "UserMatchFollow_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserMatchFollow_userId_matchId_key" ON "UserMatchFollow"("userId","matchId")`,
  `CREATE INDEX IF NOT EXISTS "UserMatchFollow_matchId_idx" ON "UserMatchFollow"("matchId")`,
];

async function main() {
  for (const s of STMTS) {
    await prisma.$executeRawUnsafe(s);
    console.log("OK:", s.slice(0, 66).replace(/\s+/g, " "));
  }
  // FK 는 IF NOT EXISTS 문법이 없다 — 존재 확인 후 추가.
  const fk = await prisma.$queryRawUnsafe<Array<{ conname: string }>>(
    `SELECT conname FROM pg_constraint WHERE conname = 'UserMatchFollow_userId_fkey'`,
  );
  if (fk.length === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "UserMatchFollow" ADD CONSTRAINT "UserMatchFollow_userId_fkey"
       FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    console.log("OK: FK 추가");
  } else {
    console.log("SKIP: FK 이미 존재");
  }
}

main().finally(() => prisma.$disconnect());
