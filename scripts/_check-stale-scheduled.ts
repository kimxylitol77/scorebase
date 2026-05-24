// 시작시간 + 3h 지났는데 여전히 SCHEDULED 인 매치 — 리그/시간별 누적.

import { prisma } from "../src/lib/db";

async function main() {
  const now = new Date();
  // 3시간 이전 시작인데 아직 SCHEDULED — 정상이면 이미 LIVE/FINISHED여야 함
  const staleCutoff = new Date(now.getTime() - 3 * 3600 * 1000);
  // 12시간 이전 = stale-cleanup 대상 (POSTPONED 전환)
  const cleanupCutoff = new Date(now.getTime() - 12 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { lt: staleCutoff },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
  });

  console.log(
    `\nNOW = ${now.toISOString()}  KST=${new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 16)}`,
  );
  console.log(`stale (>3h) = ${matches.length}건\n`);

  // 리그별 카운트
  const byLeague = new Map<string, { total: number; over12h: number }>();
  for (const m of matches) {
    const row = byLeague.get(m.league) ?? { total: 0, over12h: 0 };
    row.total++;
    if (m.startTime < cleanupCutoff) row.over12h++;
    byLeague.set(m.league, row);
  }

  console.log("리그                 stale  >12h(cleanup 대상)");
  console.log("─".repeat(50));
  for (const [lg, r] of Array.from(byLeague.entries()).sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    console.log(`${lg.padEnd(20)} ${String(r.total).padStart(5)}  ${String(r.over12h).padStart(5)}`);
  }

  console.log(`\n샘플 (앞 30개, 가장 최근 시작순):`);
  for (const m of matches.slice(0, 30)) {
    const kst = new Date(m.startTime.getTime() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 16);
    const ageH = ((now.getTime() - m.startTime.getTime()) / 3600 / 1000).toFixed(1);
    console.log(
      `  ${m.league.padEnd(12)} KST=${kst}  ${ageH}h前  ${m.homeTeam.name} vs ${m.awayTeam.name}  ext=${m.externalId}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
