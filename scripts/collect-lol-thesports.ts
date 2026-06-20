// TheSports LOL(LCK 계열) 매치를 production DB 로 수집. 로컬/워커 전용 (IP whitelist).
// 사용: npx tsx scripts/collect-lol-thesports.ts            (dry-run — fetch + 요약만)
//       npx tsx scripts/collect-lol-thesports.ts --commit   (실제 upsert)
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchLolThesportsAll } from "@/lib/sports/lol-thesports";
import { upsertMatch } from "@/jobs/collect";

(async () => {
  const COMMIT = process.argv.includes("--commit");
  const matches = await fetchLolThesportsAll();

  const byLeague = new Map<string, number>();
  const byStatus = new Map<string, number>();
  let minT = Infinity;
  let maxT = -Infinity;
  for (const m of matches) {
    byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);
    byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);
    const t = m.startTime.getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  console.log(`fetched ${matches.length}경기`);
  console.log(`  리그: ${[...byLeague].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`  status: ${[...byStatus].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  if (matches.length)
    console.log(
      `  기간: ${new Date(minT).toISOString().slice(0, 10)} ~ ${new Date(maxT).toISOString().slice(0, 10)}`,
    );
  console.log(`  최근 5경기:`);
  [...matches]
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, 5)
    .forEach((m) =>
      console.log(
        `    ${m.startTime.toISOString().slice(0, 10)} [${m.league}] ${m.homeTeam.name} ${m.homeScore}:${m.awayScore} ${m.awayTeam.name} (${m.status})`,
      ),
    );

  if (!COMMIT) {
    console.log(`\n[dry-run] 실제 저장하려면 --commit 플래그를 붙이세요.`);
    return;
  }

  console.log(`\nupsert 시작...`);
  let ok = 0;
  let fail = 0;
  for (const m of matches) {
    try {
      await upsertMatch(m);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  실패 ${m.externalId}: ${(e as Error).message}`);
    }
  }
  console.log(`완료: upsert ${ok}건, 실패 ${fail}건`);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
