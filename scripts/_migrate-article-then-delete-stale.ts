// stale LIVE row + 정확한 FINISHED row 가 같은 매치인데 article 이 stale row 가리키면
// article matchId 를 FINISHED row 로 migrate → stale row 삭제.
// score 차이 비교로 안전성 검증.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

async function main() {
  const now = new Date();
  const past = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const future = new Date(now.getTime() + 14 * 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: { startTime: { gte: past, lte: future } },
    select: {
      id: true,
      league: true,
      externalId: true,
      status: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const hour = m.startTime.toISOString().slice(0, 13);
    const teamKey = [m.homeTeam.name, m.awayTeam.name].sort().join("|");
    const key = `${m.league}__${hour}__${teamKey}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  // 처리 대상 그룹: 2개 row, 한쪽 LIVE/SCHEDULED + 다른쪽 FINISHED
  const cases: { keep: (typeof matches)[number]; stale: (typeof matches)[number]; scoreMatch: boolean }[] = [];
  for (const [, items] of groups) {
    if (items.length !== 2) continue;
    const finished = items.find((m) => m.status === "FINISHED");
    const stale = items.find((m) => m.status === "LIVE" || m.status === "SCHEDULED");
    if (!finished || !stale) continue;
    const scoreMatch =
      (finished.homeScore ?? null) === (stale.homeScore ?? null) &&
      (finished.awayScore ?? null) === (stale.awayScore ?? null);
    cases.push({ keep: finished, stale, scoreMatch });
  }

  console.log(`=== Migrate plan ===`);
  console.log(`stale row + FINISHED row 그룹: ${cases.length}개\n`);

  // article link 검사
  const staleIds = cases.map((c) => c.stale.id);
  const articles = await prisma.article.findMany({
    where: { matchId: { in: staleIds } },
    select: { id: true, matchId: true, slug: true },
  });
  console.log(`Article link: ${articles.length}건\n`);

  for (const c of cases) {
    const articlesForStale = articles.filter((a) => a.matchId === c.stale.id);
    const scoreInfo = c.scoreMatch
      ? "score 일치"
      : `score 다름: keep ${c.keep.homeScore}:${c.keep.awayScore} vs stale ${c.stale.homeScore}:${c.stale.awayScore}`;
    console.log(
      `[${c.keep.league}] ${c.keep.homeTeam.name} vs ${c.keep.awayTeam.name} @ ${c.keep.startTime.toISOString().slice(0, 16)}`,
    );
    console.log(`  keep:  id=${c.keep.id} ext=${c.keep.externalId} FINISHED ${c.keep.homeScore}:${c.keep.awayScore}`);
    console.log(`  stale: id=${c.stale.id} ext=${c.stale.externalId} ${c.stale.status} ${c.stale.homeScore}:${c.stale.awayScore} (${scoreInfo})`);
    if (articlesForStale.length > 0) {
      for (const a of articlesForStale) {
        console.log(`         article → ${a.slug} (matchId ${a.matchId} → ${c.keep.id})`);
      }
    }
    console.log("");
  }

  // 안전 cutoff: score 다른 케이스는 자동 migrate 안 함 — 사용자 확인 필요
  const unsafe = cases.filter((c) => !c.scoreMatch);
  if (unsafe.length > 0) {
    console.log(`⚠️  score 가 다른 ${unsafe.length} 케이스는 자동 처리 안 됨 (수동 확인 필요)`);
  }
  const safe = cases.filter((c) => c.scoreMatch);
  console.log(`✅ score 일치하는 ${safe.length} 케이스 → migrate + delete 안전 진행 가능\n`);

  if (!APPLY) {
    console.log(`[dry-run] 실제 적용하려면 --apply`);
    return;
  }

  console.log(`=== Applying (safe ${safe.length} 케이스) ===`);
  let migrated = 0;
  let deleted = 0;
  let cacheDeleted = 0;
  for (const c of safe) {
    // 1) article matchId migrate
    const r = await prisma.article.updateMany({
      where: { matchId: c.stale.id },
      data: { matchId: c.keep.id },
    });
    migrated += r.count;
    // 2) stale 의 cache (FK) 삭제
    const cr = await prisma.theSportsMatchCache.deleteMany({ where: { matchId: c.stale.id } });
    cacheDeleted += cr.count;
    // 3) stale match 삭제
    await prisma.match.delete({ where: { id: c.stale.id } });
    deleted++;
  }
  console.log(`Article matchId migrated: ${migrated}`);
  console.log(`Cache deleted: ${cacheDeleted}`);
  console.log(`Stale match deleted: ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
