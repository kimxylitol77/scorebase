// LMB 5/22-5/26 SCHEDULED 31경기 → POSTPONED 일괄 변경.
// 원인: BASEBALL_LEAGUES set 에 LMB 누락으로 cache → Match 동기화 5/22~ 안 됨.
// 5effaf7 fix 로 5/27 부터 자동 복구. 5/22-5/26 31경기는 외부 source (TheSports trial /
// sofascore 403 / ESPN 미커버) 모두 막혀 score backfill 불가. POSTPONED 로 표시 정리.

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const prisma = new PrismaClient();

const START = new Date("2026-05-22T00:00:00Z");
const END = new Date("2026-05-27T00:00:00Z");

async function main() {
  const targets = await prisma.match.findMany({
    where: {
      league: "LMB",
      startTime: { gte: START, lt: END },
      status: "SCHEDULED",
    },
    select: { id: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });
  console.log(`Targets: ${targets.length}`);
  for (const m of targets) {
    console.log(`  ${m.id} ${m.startTime.toISOString()} ${m.homeTeam.name} vs ${m.awayTeam.name}`);
  }

  const r = await prisma.match.updateMany({
    where: {
      league: "LMB",
      startTime: { gte: START, lt: END },
      status: "SCHEDULED",
    },
    data: { status: "POSTPONED" },
  });
  console.log(`Updated to POSTPONED: ${r.count}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
