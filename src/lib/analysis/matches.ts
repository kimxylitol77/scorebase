// 분석 게시판 예측용 — 종목별 "예정 경기(SCHEDULED, 미래)" 목록.
// 글 작성 시 종목 토글 → 경기 드롭다운에 채움.

import "server-only";
import { prisma } from "@/lib/db";
import { type SportCode, leaguesForSport } from "@/lib/sports/sport-leagues";

export interface UpcomingMatch {
  id: number;
  league: string;
  startTime: Date;
  homeTeamName: string;
  awayTeamName: string;
}

/**
 * 종목의 예정 경기 목록 (시작 임박 순). 예측 픽 대상.
 * @param sport soccer | baseball | basketball | hockey
 */
export async function getUpcomingMatchesForSport(
  sport: SportCode,
  limit = 40,
): Promise<UpcomingMatch[]> {
  const leagues = leaguesForSport(sport);
  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      status: "SCHEDULED",
      startTime: { gte: new Date() },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: limit,
  });
  return matches.map((m) => ({
    id: m.id,
    league: m.league,
    startTime: m.startTime,
    homeTeamName: m.homeTeam.name,
    awayTeamName: m.awayTeam.name,
  }));
}
