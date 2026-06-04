// 코너·카드 백필 — api-football /fixtures/statistics 에서 과거 종료경기 통계를 수집해
// MatchStats 에 적재. TheSports 라이브 캐시 커버리지(메이저 리그 얇음)를 보완.
//
// 축구 Match.externalId = api-football fixture id 라 바로 호출 가능.
// home/away 는 FixtureStat.teamId === Team.externalId(=api-football team id) 정확 매칭만 적재
// (매칭 실패 시 skip — home/away 오배치 방지).

import { prisma } from "@/lib/db";
import {
  fetchFixtureStatistics,
  fetchSeasonFixtures,
  teamsMatch,
  API_FOOTBALL_LEAGUE_ID,
} from "./api-football-pro";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function backfillFootballCorners(
  limit = 150,
  leagues?: string[],
): Promise<{ scanned: number; captured: number; skipped: number }> {
  const targetLeagues = (leagues ?? Object.keys(API_FOOTBALL_LEAGUE_ID)).filter(
    (l) => l in API_FOOTBALL_LEAGUE_ID,
  );
  const matches = await prisma.match.findMany({
    where: {
      league: { in: targetLeagues },
      status: "FINISHED",
      matchStats: { is: null },
      externalId: { not: "" },
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      homeTeam: { select: { externalId: true } },
      awayTeam: { select: { externalId: true } },
    },
    take: limit,
    orderBy: { startTime: "desc" },
  });

  let captured = 0;
  let skipped = 0;
  for (const m of matches) {
    const fid = Number(m.externalId);
    if (!Number.isFinite(fid)) {
      skipped++;
      continue;
    }
    const stats = await fetchFixtureStatistics(fid);
    await sleep(150); // rate limit 완충
    if (stats.length < 2) {
      skipped++;
      continue;
    }
    const homeExt = Number(m.homeTeam.externalId);
    const awayExt = Number(m.awayTeam.externalId);
    const h = stats.find((s) => s.teamId === homeExt);
    const a = stats.find((s) => s.teamId === awayExt);
    if (!h || !a) {
      skipped++; // 팀 매칭 실패 — home/away 오배치 방지
      continue;
    }
    if (h.cornerKicks == null && a.cornerKicks == null) {
      skipped++; // 코너 없으면 의미 없는 통계
      continue;
    }
    try {
      await prisma.matchStats.create({
        data: {
          matchId: m.id,
          league: m.league,
          source: "api-football",
          homeCorners: h.cornerKicks ?? null,
          awayCorners: a.cornerKicks ?? null,
          homeYellow: h.yellowCards ?? null,
          awayYellow: a.yellowCards ?? null,
          homeRed: h.redCards ?? null,
          awayRed: a.redCards ?? null,
          homeShots: h.shotsTotal ?? null,
          awayShots: a.shotsTotal ?? null,
          homeShotsOnTarget: h.shotsOnGoal ?? null,
          awayShotsOnTarget: a.shotsOnGoal ?? null,
          homePossession: h.possessionPct ?? null,
          awayPossession: a.possessionPct ?? null,
        },
      });
      captured++;
    } catch {
      skipped++; // unique 충돌 등
    }
  }
  return { scanned: matches.length, captured, skipped };
}

function seasonOf(d: Date): number {
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  return m >= 7 ? y : y - 1; // 유럽 리그(8월~5월) 시즌 = 시작 연도
}

/**
 * 메이저 리그(TheSports 수집 → externalId≠fixture id) 코너 백필.
 * 리그-시즌 전체 fixture 를 1콜로 받아 날짜(±36h)+팀명(teamsMatch) 매칭 → fixture id → 통계 호출.
 * 유럽 리그(EPL/라리가/세리에A/분데스/리그1/UCL 등) 대상.
 */
export async function backfillMajorCornersMapped(
  leagues: string[],
  limit = 400,
): Promise<{ scanned: number; captured: number; skipped: number; fixtureCalls: number }> {
  const targetLeagues = leagues.filter((l) => l in API_FOOTBALL_LEAGUE_ID);
  const matches = await prisma.match.findMany({
    where: { league: { in: targetLeagues }, status: "FINISHED", matchStats: { is: null } },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    take: limit,
    orderBy: { startTime: "desc" },
  });

  // (league, season) 그룹핑 — 시즌 전체 fixture 를 그룹당 1콜로 받기 위함
  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const k = `${m.league}:${seasonOf(m.startTime)}`;
    const arr = groups.get(k);
    if (arr) arr.push(m);
    else groups.set(k, [m]);
  }

  let captured = 0;
  let skipped = 0;
  let fixtureCalls = 0;
  for (const [k, ms] of groups) {
    const [lg, seasonStr] = k.split(":");
    const fixtures = await fetchSeasonFixtures(lg, Number(seasonStr));
    await sleep(200);
    if (fixtures.length === 0) {
      skipped += ms.length;
      continue;
    }
    for (const m of ms) {
      const dms = m.startTime.getTime();
      const fx = fixtures.find(
        (f) =>
          Math.abs(f.dateMs - dms) < 36 * 3600 * 1000 &&
          teamsMatch(f.homeName, m.homeTeam.name) &&
          teamsMatch(f.awayName, m.awayTeam.name),
      );
      if (!fx) {
        skipped++;
        continue;
      }
      const stats = await fetchFixtureStatistics(fx.id);
      await sleep(150);
      fixtureCalls++;
      const h = stats.find((s) => teamsMatch(s.teamName, m.homeTeam.name));
      const a = stats.find((s) => teamsMatch(s.teamName, m.awayTeam.name));
      if (!h || !a || (h.cornerKicks == null && a.cornerKicks == null)) {
        skipped++;
        continue;
      }
      try {
        await prisma.matchStats.create({
          data: {
            matchId: m.id,
            league: m.league,
            source: "api-football",
            homeCorners: h.cornerKicks ?? null,
            awayCorners: a.cornerKicks ?? null,
            homeYellow: h.yellowCards ?? null,
            awayYellow: a.yellowCards ?? null,
            homeRed: h.redCards ?? null,
            awayRed: a.redCards ?? null,
            homeShots: h.shotsTotal ?? null,
            awayShots: a.shotsTotal ?? null,
            homeShotsOnTarget: h.shotsOnGoal ?? null,
            awayShotsOnTarget: a.shotsOnGoal ?? null,
            homePossession: h.possessionPct ?? null,
            awayPossession: a.possessionPct ?? null,
          },
        });
        captured++;
      } catch {
        skipped++;
      }
    }
  }
  return { scanned: matches.length, captured, skipped, fixtureCalls };
}
