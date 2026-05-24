// 오늘 (KST) 야구 매치 중 PREVIEW 글 누락 카운트
import { prisma } from "../src/lib/db";

async function main() {
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayStart = new Date(
    Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate(), -9),
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: ["KBO", "NPB", "MLB"] },
      startTime: { gte: todayStart, lt: todayEnd },
      status: { not: "POSTPONED" },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      articles: {
        where: { type: "PREVIEW" },
        select: { slug: true, status: true, createdAt: true },
      },
    },
    orderBy: [{ league: "asc" }, { startTime: "asc" }],
  });

  console.log(`\n오늘 (KST ${todayStart.toISOString().slice(0,10)}) 야구 매치: ${matches.length}경기\n`);

  const byLeague: Record<string, { total: number; published: number; missing: typeof matches }> = {};
  for (const m of matches) {
    if (!byLeague[m.league]) byLeague[m.league] = { total: 0, published: 0, missing: [] };
    byLeague[m.league].total++;
    const published = m.articles.find((a) => a.status === "PUBLISHED");
    if (published) byLeague[m.league].published++;
    else byLeague[m.league].missing.push(m);
  }

  for (const [lg, info] of Object.entries(byLeague)) {
    console.log(`[${lg}] ${info.published}/${info.total} 발행됨 (누락 ${info.missing.length})`);
    for (const m of info.missing) {
      const t = m.startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
      const draftSlug = m.articles[0]?.slug;
      const draftStatus = m.articles[0]?.status;
      console.log(`  - ${t} ${m.awayTeam.name} @ ${m.homeTeam.name} [status=${m.status}] ${draftSlug ? `draft=${draftStatus}:${draftSlug}` : "Article 없음"}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
