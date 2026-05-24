// PREVIEW 누락 전체 점검.
// 1) 다음 7일 SCHEDULED 매치 중 PREVIEW 글 없는 비율 (리그별)
// 2) 어제 ~ 오늘 FINISHED 매치 중 PREVIEW 가 사전 발행됐어야 하는데 없었던 매치
// NO_ARTICLE_LEAGUES (글 생성 X) 제외.

import { PrismaClient } from "@prisma/client";
import { NO_ARTICLE_LEAGUES } from "../src/lib/sports/types";

const prisma = new PrismaClient();
const skipSet = new Set<string>(NO_ARTICLE_LEAGUES);

async function main() {
  const now = new Date();
  const past7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const next7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  // 1) 다음 7일 SCHEDULED — PREVIEW 글 link 있는지
  const upcoming = await prisma.match.findMany({
    where: {
      startTime: { gte: now, lte: next7 },
      status: "SCHEDULED",
      AND: [
        { homeTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
        { awayTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
        { homeTeam: { is: { name: { not: { contains: "/" } } } } },
        { awayTeam: { is: { name: { not: { contains: "/" } } } } },
      ],
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      articles: { where: { type: "PREVIEW", status: "PUBLISHED" }, select: { slug: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const upcomingFiltered = upcoming.filter((m) => !skipSet.has(m.league));
  const byLeague = new Map<string, { total: number; missing: number; missingSamples: string[] }>();
  for (const m of upcomingFiltered) {
    const e = byLeague.get(m.league) ?? { total: 0, missing: 0, missingSamples: [] };
    e.total++;
    if (m.articles.length === 0) {
      e.missing++;
      if (e.missingSamples.length < 3) {
        e.missingSamples.push(`id=${m.id} ${m.homeTeam.name} vs ${m.awayTeam.name} ${m.startTime.toISOString().slice(5, 16)}`);
      }
    }
    byLeague.set(m.league, e);
  }

  console.log(`\n=== 다음 7일 SCHEDULED PREVIEW 누락 (글 생성 리그 only) ===`);
  console.log(`전체: ${upcomingFiltered.length} 매치 / 누락 ${upcomingFiltered.filter((m) => m.articles.length === 0).length}`);
  console.log();
  const rows = [...byLeague.entries()].sort((a, b) => b[1].missing - a[1].missing);
  for (const [league, info] of rows) {
    if (info.missing === 0) continue;
    const pct = ((info.missing / info.total) * 100).toFixed(0);
    console.log(`${league.padEnd(14)} missing ${info.missing}/${info.total} (${pct}%)`);
    for (const s of info.missingSamples) console.log(`  • ${s}`);
  }

  // 2) 과거 7일 FINISHED — PREVIEW 사전에 있어야 했는데 없는 매치
  const past = await prisma.match.findMany({
    where: {
      startTime: { gte: past7, lte: now },
      status: "FINISHED",
      AND: [
        { homeTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
        { awayTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
        { homeTeam: { is: { name: { not: { contains: "/" } } } } },
        { awayTeam: { is: { name: { not: { contains: "/" } } } } },
      ],
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      articles: { where: { type: "PREVIEW", status: "PUBLISHED" }, select: { slug: true, createdAt: true } },
    },
    orderBy: { startTime: "desc" },
  });
  const pastFiltered = past.filter((m) => !skipSet.has(m.league));
  const byLeague2 = new Map<string, { total: number; missing: number }>();
  for (const m of pastFiltered) {
    const e = byLeague2.get(m.league) ?? { total: 0, missing: 0 };
    e.total++;
    if (m.articles.length === 0) e.missing++;
    byLeague2.set(m.league, e);
  }
  console.log(`\n=== 과거 7일 FINISHED PREVIEW 누락 ===`);
  console.log(`전체: ${pastFiltered.length} 매치 / 누락 ${pastFiltered.filter((m) => m.articles.length === 0).length}`);
  console.log();
  for (const [league, info] of [...byLeague2.entries()].sort((a, b) => b[1].missing - a[1].missing)) {
    if (info.missing === 0) continue;
    const pct = ((info.missing / info.total) * 100).toFixed(0);
    console.log(`${league.padEnd(14)} missing ${info.missing}/${info.total} (${pct}%)`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
