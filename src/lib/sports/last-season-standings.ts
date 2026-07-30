// 지난 시즌 최종 순위를 DB 완료 매치에서 자체 산출 — 시즌 전환기에 외부 standings 캐시가
// 새 시즌으로 리셋되면(승·무·패·승점 전부 0) 지난 시즌 기록이 통째로 사라지는 것을 복구한다.
// 축구 전용(승 3 · 무 1 · 패 0). 라이브 순위 파이프라인(getFullStandings)은 건드리지 않는다.
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import type { StandingsRow } from "@/lib/sports/thesports/standings-helper";

// 마지막 완료 경기에서 거슬러 올라가는 시즌 창(일). 유럽 축구 시즌은 8월~5월 약 300일이라
// 330일이면 한 시즌은 온전히 담고 그 전 시즌(365일+ 전 종료)은 들어오지 않는다.
const SEASON_SPAN_DAYS = 330;

/**
 * 리그의 직전 시즌 최종 순위 — 마지막 FINISHED 매치 기준 330일 창의 완료 경기 집계.
 * 축구가 아니거나 완료 매치가 없으면 빈 배열.
 */
export async function computeLastSeasonStandings(league: string): Promise<StandingsRow[]> {
  if (!SOCCER_LEAGUES.has(league)) return [];

  const lastFinished = await prisma.match.findFirst({
    where: { league, status: "FINISHED" },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });
  if (!lastFinished) return [];

  const to = new Date(lastFinished.startTime.getTime() + 86400_000);
  const from = new Date(lastFinished.startTime.getTime() - SEASON_SPAN_DAYS * 86400_000);
  const matches = await prisma.match.findMany({
    where: {
      league,
      status: "FINISHED",
      startTime: { gte: from, lt: to },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  if (matches.length === 0) return [];

  const acc = new Map<number, StandingsRow>();
  const row = (teamId: number) => {
    let r = acc.get(teamId);
    if (!r) {
      r = { teamId, position: 0, points: 0, won: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0 };
      acc.set(teamId, r);
    }
    return r;
  };
  for (const m of matches) {
    const hs = m.homeScore!;
    const as = m.awayScore!;
    const h = row(m.homeTeamId);
    const a = row(m.awayTeamId);
    h.goalsFor! += hs;
    h.goalsAgainst! += as;
    a.goalsFor! += as;
    a.goalsAgainst! += hs;
    if (hs > as) {
      h.won++;
      h.points += 3;
      a.loss++;
    } else if (hs < as) {
      a.won++;
      a.points += 3;
      h.loss++;
    } else {
      h.draw++;
      h.points++;
      a.draw++;
      a.points++;
    }
  }

  const rows = [...acc.values()].map((r) => ({ ...r, goalDiff: r.goalsFor! - r.goalsAgainst! }));
  rows.sort((x, y) => y.points - x.points || y.goalDiff! - x.goalDiff! || y.goalsFor! - x.goalsFor!);
  return rows.map((r, i) => ({ ...r, position: i + 1 }));
}
