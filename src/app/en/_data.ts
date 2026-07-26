// /en 페이지 공용 데이터 헬퍼 — Match 예측 필드를 영문 표시용 plain object 로 변환.
// 팀명은 DB 원본(영문) 그대로 사용 — 한글 매퍼를 태우지 않는 것이 영어판의 핵심.
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";

export interface EnMatchRow {
  id: number;
  league: string;
  startTime: string; // ISO
  status: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
  predWinner: string | null;
  predCorrect: boolean | null;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  predOverPick: string | null;
  predOverProb: number | null;
  predHcPick: string | null;
  predHcLine: number | null;
  predHcProb: number | null;
}

const MATCH_SELECT = {
  id: true,
  league: true,
  startTime: true,
  status: true,
  homeScore: true,
  awayScore: true,
  predHome: true,
  predDraw: true,
  predAway: true,
  predWinner: true,
  predCorrect: true,
  marketHome: true,
  marketDraw: true,
  marketAway: true,
  predOverPick: true,
  predOverProb: true,
  predHcPick: true,
  predHcLine: true,
  predHcProb: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
} as const;

type MatchWithTeams = {
  id: number;
  league: string;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
  predWinner: string | null;
  predCorrect: boolean | null;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  predOverPick: string | null;
  predOverProb: number | null;
  predHcPick: string | null;
  predHcLine: number | null;
  predHcProb: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
};

function toRow(m: MatchWithTeams): EnMatchRow {
  return {
    id: m.id,
    league: m.league,
    startTime: m.startTime.toISOString(),
    status: m.status,
    home: toEnglishTeamName(m.homeTeam.name),
    away: toEnglishTeamName(m.awayTeam.name),
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    predHome: m.predHome,
    predDraw: m.predDraw,
    predAway: m.predAway,
    predWinner: m.predWinner,
    predCorrect: m.predCorrect,
    marketHome: m.marketHome,
    marketDraw: m.marketDraw,
    marketAway: m.marketAway,
    predOverPick: m.predOverPick,
    predOverProb: m.predOverProb,
    predHcPick: m.predHcPick,
    predHcLine: m.predHcLine,
    predHcProb: m.predHcProb,
  };
}

/** 예측이 있는 예정 경기 — league 미지정이면 leagues 전체에서. */
export async function fetchUpcomingPredicted(
  leagues: string[],
  opts: { withinHours?: number; limit?: number } = {},
): Promise<EnMatchRow[]> {
  const { withinHours = 72, limit = 30 } = opts;
  const now = new Date();
  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + withinHours * 3600_000) },
      predHome: { not: null },
    },
    orderBy: { startTime: "asc" },
    take: limit,
    select: MATCH_SELECT,
  });
  return matches.map(toRow);
}

/** 예측 판정이 끝난 최근 종료 경기 — 적중 여부 투명 공개용. */
export async function fetchRecentJudged(league: string, limit = 10): Promise<EnMatchRow[]> {
  const matches = await prisma.match.findMany({
    where: { league, status: "FINISHED", predCorrect: { not: null } },
    orderBy: { startTime: "desc" },
    take: limit,
    select: MATCH_SELECT,
  });
  return matches.map(toRow);
}
