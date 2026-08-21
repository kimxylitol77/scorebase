// 리그 전체 매치·팀명 조회 — React cache 로 같은 요청 내 중복 쿼리 방지.
// MatchInsight 와 SoccerTeamStrength 가 한 페이지에서 같은 데이터를 쓰므로 여기로 일원화.

import { cache } from "react";
import { prisma } from "@/lib/db";
import type { PredictMatch } from "@/lib/predict/types";

/** 리그 전체 매치 (Elo/standings/폼 계산용) — 요청당 1회 조회. */
export const getLeagueMatches = cache(
  async (league: string): Promise<PredictMatch[]> => {
    const rows = await prisma.match.findMany({
      where: { league },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
    });
    return rows.map((m) => ({ ...m }));
  },
);

/** 리그 전체 팀 id·이름 — 산점도 라벨 등. 요청당 1회 조회. */
export const getLeagueTeamNames = cache(
  async (league: string): Promise<Array<{ id: number; name: string }>> => {
    return prisma.team.findMany({
      where: { league },
      select: { id: true, name: true },
    });
  },
);

/**
 * 팀 기준 매치 — 승격·강등으로 그 리그에 과거 경기가 없는 팀의 폼·홈원정 폴백용.
 * 리그를 가리지 않되 친선은 뺀다(로테이션이라 전력 신호가 아니다).
 * 예: 26-27 EPL 헐 시티는 EPL 경기가 0건이고 25-26 챔피언십 49건이 전부다.
 */
export const getTeamMatches = cache(
  async (teamId: number): Promise<PredictMatch[]> => {
    const rows = await prisma.match.findMany({
      where: {
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        league: { notIn: ["CLUB_FRIENDLY", "INTL_FRIENDLY"] },
      },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
      orderBy: { startTime: "desc" },
      take: 80,
    });
    return rows.map((m) => ({ ...m }));
  },
);
