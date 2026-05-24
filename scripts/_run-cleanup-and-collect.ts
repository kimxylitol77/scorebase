// A+B 실행:
//   1) >12h SCHEDULED → POSTPONED (cleanup-stale-scheduled cron 과 동일 로직)
//   2) 어제+오늘 collect 재실행 (score/status 보정)

import { prisma } from "../src/lib/db";
import { runCollect } from "../src/jobs/collect";

async function main() {
  // ─── A: stale cleanup ───
  const STALE_HOURS = 12;
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    select: { id: true, league: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  console.log(`\n[A] stale (>${STALE_HOURS}h) SCHEDULED → POSTPONED 대상: ${stale.length}건`);
  for (const m of stale) {
    console.log(`  ${m.league.padEnd(14)} ${m.startTime.toISOString().slice(0, 16)}  ${m.homeTeam.name} vs ${m.awayTeam.name}`);
  }
  if (stale.length > 0) {
    const r = await prisma.match.updateMany({
      where: { id: { in: stale.map((m) => m.id) } },
      data: { status: "POSTPONED" },
    });
    console.log(`[A] ${r.count}건 POSTPONED 처리 완료`);
  }

  // ─── B: collect 재실행 (어제+오늘 date 범위) ───
  console.log(`\n[B] collect 재실행 — 어제+오늘 (pastDays=1)`);
  const today = new Date().toISOString().slice(0, 10);
  await runCollect({ date: today, pastDays: 1 });
  console.log(`[B] collect 완료`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
