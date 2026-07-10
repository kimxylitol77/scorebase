// UFC 랭킹 주간 스냅샷 — ESPN 에서 긁은 랭킹을 MmaRanking 테이블에 upsert.
// 호출: /api/cron/mma (주 1회 게이트) 또는 수동 `npx tsx src/jobs/snapshot-ufc-rankings.ts`.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchUfcRankings } from "@/lib/sports/ufc-rankings";

export async function runSnapshotUfcRankings(): Promise<{ categories: number; fighters: number }> {
  const snap = await fetchUfcRankings();
  let fighters = 0;
  for (const c of snap) {
    // 컨텐더 0명이면 ESPN 응답 실패로 보고 덮어쓰기 skip (기존 스냅샷 보존)
    if (c.ranks.length === 0) continue;
    fighters += c.ranks.length + (c.champion ? 1 : 0);
    const data = {
      displayName: c.displayName,
      gender: c.gender,
      isP4p: c.isP4p,
      sortOrder: c.sortOrder,
      champion: c.champion ? JSON.stringify(c.champion) : null,
      ranks: JSON.stringify(c.ranks),
    };
    await prisma.mmaRanking.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, ...data },
      update: data,
    });
  }
  return { categories: snap.filter((c) => c.ranks.length > 0).length, fighters };
}

if (require.main === module) {
  runSnapshotUfcRankings()
    .then((r) => {
      console.log(`UFC 랭킹 스냅샷: 카테고리 ${r.categories}개 · 파이터 ${r.fighters}명`);
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
