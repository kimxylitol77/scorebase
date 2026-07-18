// Match.fixtureStats(xG 포함) 백필 — af cron(36h 창)이 놓친 FINISHED 매치 보강.
// 시즌 fixture 전체를 리그당 1콜로 받아 날짜(±36h)+팀명 매칭 → fixture id → 통계 호출
// (api-football-corners 의 backfillMajorCornersMapped 패턴). /standings xG 심화의
// 커버리지 게이트(90%) 통과가 목적. 재실행 안전 (이미 xG 있는 매치는 스킵).
//
// 사용: npx tsx scripts/backfill-fixture-xg.ts EPL [sinceDays=400] [limit=500]
import "../src/lib/env";
import { prisma } from "../src/lib/db";
import {
  API_FOOTBALL_LEAGUE_ID,
  fetchSeasonFixtures,
  fetchFixtureStatistics,
  teamsMatch,
} from "../src/lib/sports/api-football-pro";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seasonOf(d: Date): number {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return m >= 7 ? y : y - 1; // 유럽 리그(8월~5월) 시즌 = 시작 연도
}

async function main() {
  const league = (process.argv[2] || "").toUpperCase();
  const sinceDays = Number(process.argv[3] || 400);
  const limit = Number(process.argv[4] || 500);
  if (!API_FOOTBALL_LEAGUE_ID[league]) {
    console.error(`사용법: npx tsx scripts/backfill-fixture-xg.ts <리그> [sinceDays] [limit] — af 리그 id 없는 리그: ${league}`);
    process.exit(1);
  }

  const all = await prisma.match.findMany({
    where: {
      league,
      status: "FINISHED",
      startTime: { gte: new Date(Date.now() - sinceDays * 86400_000) },
    },
    select: {
      id: true,
      startTime: true,
      apiFixtureId: true,
      fixtureStats: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "desc" },
  });
  // 대상: fixtureStats 없음 또는 expectedGoals 미포함 (stats 는 있는데 xG 만 빠진 초기 수집분).
  const targets = all
    .filter((m) => !m.fixtureStats || !m.fixtureStats.includes("expectedGoals"))
    .slice(0, limit);
  console.log(`[xg-backfill] ${league} FINISHED ${all.length}건 중 대상 ${targets.length}건`);
  if (targets.length === 0) return;

  // (season) 그룹핑 — 시즌 fixture 목록 1콜/시즌
  const bySeason = new Map<number, typeof targets>();
  for (const m of targets) {
    const s = seasonOf(m.startTime);
    const arr = bySeason.get(s);
    if (arr) arr.push(m);
    else bySeason.set(s, [m]);
  }

  let updated = 0;
  let withXg = 0;
  let noFixture = 0;
  let noStats = 0;
  for (const [season, ms] of bySeason) {
    const fixtures = await fetchSeasonFixtures(league, season);
    await sleep(200);
    console.log(`[xg-backfill] ${league} ${season} 시즌 fixture ${fixtures.length}건, 대상 ${ms.length}건`);
    for (const m of ms) {
      let fid = m.apiFixtureId ?? null;
      if (!fid) {
        const dms = m.startTime.getTime();
        const fx = fixtures.find(
          (f) =>
            Math.abs(f.dateMs - dms) < 36 * 3600_000 &&
            teamsMatch(f.homeName, m.homeTeam.name) &&
            teamsMatch(f.awayName, m.awayTeam.name),
        );
        if (!fx) {
          noFixture++;
          continue;
        }
        fid = fx.id;
      }
      const stats = await fetchFixtureStatistics(fid);
      await sleep(150);
      if (stats.length === 0) {
        noStats++;
        continue;
      }
      // 저장 순서는 [home, away] 보장 — 팀명 매칭 실패 시 af 원본 순서(home 우선 관례) 유지.
      const h = stats.find((s) => teamsMatch(s.teamName, m.homeTeam.name));
      const a = stats.find((s) => teamsMatch(s.teamName, m.awayTeam.name));
      const ordered = h && a && h !== a ? [h, a] : stats;
      const hasXg = ordered.some((s) => s.expectedGoals != null);
      // 기존 stats 가 있는데 새 응답에 xG 가 없으면 덮지 않음 (무의미한 갱신 방지).
      if (m.fixtureStats && !hasXg) {
        noStats++;
        continue;
      }
      await prisma.match.update({
        where: { id: m.id },
        data: { fixtureStats: JSON.stringify(ordered), ...(m.apiFixtureId ? {} : { apiFixtureId: fid }) },
      });
      updated++;
      if (hasXg) withXg++;
    }
  }
  console.log(`[xg-backfill] 완료 — 저장 ${updated}건(xG 포함 ${withXg}) · fixture 미매칭 ${noFixture} · 통계 없음 ${noStats}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
