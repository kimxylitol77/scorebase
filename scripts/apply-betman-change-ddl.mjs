// prisma/sql/20260921-betman-change.sql 을 운영 DB 에 적용 — 장기 트랜잭션 확인 + lock_timeout 3s (prod DDL 락 사고 절차).
// 신규 컬럼 1 + 신규 테이블 1 (IF NOT EXISTS, 재실행 안전).
// 실행: node --env-file=.env.local scripts/apply-betman-change-ddl.mjs
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();

const longTx = await prisma.$queryRawUnsafe(`
  SELECT pid, now() - xact_start AS dur, left(query, 80) AS q
  FROM pg_stat_activity
  WHERE state <> 'idle' AND xact_start < now() - interval '30 seconds'
`);
if (longTx.length > 0) {
  console.error("장기 트랜잭션 발견 — DDL 중단:", longTx);
  process.exit(1);
}

const sql = readFileSync(new URL("../prisma/sql/20260921-betman-change.sql", import.meta.url), "utf8");
const stmts = sql
  .split(/;\s*\n/)
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);
for (const s of stmts) {
  await prisma.$executeRawUnsafe(s);
  console.log("ok:", s.split("\n")[0].slice(0, 70));
}

const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_name='BetmanOddsChange' ORDER BY ordinal_position`,
);
console.log("BetmanOddsChange 컬럼:", cols.map((c) => c.column_name).join(", "));
const ms = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_name='BetmanOdds' AND column_name='mchScore'`,
);
console.log("BetmanOdds.mchScore:", ms.length === 1 ? "있음" : "없음");
await prisma.$disconnect();
