// 오늘(5/12 KST) 발행된 비-LoL PREVIEW + RECAP 새 톤으로 catch-up.
// 패턴: 리그별 deleteMany then runPreview. RECAP 은 article id 받아 delete then runRecap.
// 매치 사이 BDL/api-football quota 부담 회피 위해 리그 사이 30s sleep.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { runPreview } from "@/jobs/generate-previews";
import { runRecap } from "@/jobs/generate-articles";

const NON_LOL_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "NBA", "NHL", "MLB",
];

async function pingDb(): Promise<void> {
  // Neon cold start 대응 — 최대 5회 시도, 점진 backoff
  const backoffs = [2000, 5000, 10000, 15000, 20000];
  for (let i = 0; i <= backoffs.length; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === backoffs.length) throw e;
      console.log(`  [db] cold start, ${backoffs[i] / 1000}s 후 재시도...`);
      await new Promise(r => setTimeout(r, backoffs[i]));
    }
  }
}

async function main() {
  const startKst = new Date("2026-05-11T15:00:00.000Z");
  const endKst = new Date("2026-05-12T14:59:59.999Z");
  console.log(`[catch-up] 시작 — 오늘 발행된 비-LoL PREVIEW/RECAP 재발행\n`);
  await pingDb();

  // 1) RECAP 1건 (어제 매치) — 먼저 처리 (BDL 부담 X)
  console.log(`=== RECAP catch-up ===`);
  const recapToday = await prisma.article.findMany({
    where: {
      type: "RECAP",
      league: { in: NON_LOL_LEAGUES },
      updatedAt: { gte: startKst, lte: endKst },
    },
    select: { id: true, slug: true, league: true, match: { select: { id: true, homeTeam: true, awayTeam: true, startTime: true } } },
  });
  console.log(`  대상: ${recapToday.length}건`);
  for (const a of recapToday) {
    if (!a.match) continue;
    console.log(`  delete RECAP #${a.id} (${a.league} ${a.match.homeTeam?.name} vs ${a.match.awayTeam?.name})`);
    await prisma.article.delete({ where: { id: a.id } });
  }
  if (recapToday.length > 0) {
    await runRecap({ autoPublish: true });
    await new Promise(r => setTimeout(r, 30000));
  }

  // 2) PREVIEW — 리그별 deleteMany + runPreview
  console.log(`\n=== PREVIEW catch-up (리그별) ===`);
  for (let i = 0; i < NON_LOL_LEAGUES.length; i++) {
    const league = NON_LOL_LEAGUES[i];
    const prevs = await prisma.article.findMany({
      where: {
        type: "PREVIEW",
        league,
        updatedAt: { gte: startKst, lte: endKst },
        match: { startTime: { gte: new Date() } },
      },
      select: { id: true },
    });
    if (prevs.length === 0) {
      console.log(`[${i + 1}/${NON_LOL_LEAGUES.length}] ${league} — 대상 0건 skip`);
      continue;
    }
    console.log(`\n[${i + 1}/${NON_LOL_LEAGUES.length}] ${league} — ${prevs.length}건 delete + runPreview`);
    await prisma.article.deleteMany({ where: { id: { in: prevs.map(p => p.id) } } });
    const t0 = Date.now();
    try {
      await runPreview({ autoPublish: true, league, horizonDays: 7, take: 50 });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ✅ ${league} 완료 (${dt}s)`);
    } catch (e) {
      console.log(`  ❌ ${league} 실패: ${(e as Error).message}`);
    }
    if (i < NON_LOL_LEAGUES.length - 1) {
      console.log(`  ⏳ 다음 리그까지 30s 대기...`);
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  // 3) 결과 요약
  console.log(`\n=== 최종 상태 ===`);
  const newPub = await prisma.article.findMany({
    where: {
      league: { in: NON_LOL_LEAGUES },
      updatedAt: { gte: new Date(Date.now() - 3 * 3600 * 1000) },
      status: "PUBLISHED",
    },
    select: { id: true, league: true, type: true, content: true, slug: true },
    orderBy: { publishedAt: "desc" },
  });
  const stats = new Map<string, { count: number; totalLen: number }>();
  for (const a of newPub) {
    const k = `${a.type}/${a.league}`;
    const s = stats.get(k) ?? { count: 0, totalLen: 0 };
    s.count++;
    s.totalLen += a.content.length;
    stats.set(k, s);
  }
  for (const [k, s] of [...stats.entries()].sort()) {
    console.log(`  ${k}: ${s.count}건, 평균 ${Math.round(s.totalLen / s.count)}자`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
