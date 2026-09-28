// 감독 기록 그림 카드용 데이터 — 글에 저장된 집계(tacticalContext)에 시즌 기록·리그 순위·경쟁 후보를 덧붙인다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { selectionTable } from "@/lib/tactical/manager-select";
import type { TacticalManagerContext } from "@/lib/tactical/manager-aggregate";

export interface CardRecord { played: number; w: number; d: number; l: number; gf: number; ga: number; points: number }

export interface ManagerCardData {
  league: string;
  /** "2026-09" */
  month: string;
  monthLabel: string;
  team: { nameKo: string; logo: string | null };
  coach: { nameKo: string; photo: string | null; formation: string | null };
  monthRecord: CardRecord & { rank: number };
  season: CardRecord & { rank: number; teams: number };
  form: { date: string; opponentKo: string; opponentLogo: string | null; homeAway: "H" | "A"; gf: number; ga: number; result: "W" | "D" | "L" }[];
  /** 선정 점수 상위 4팀. 첫 행이 선정 팀이 아닐 수 있어 isWinner 로 표시 */
  rivals: { nameKo: string; logo: string | null; ppg: number; expectedPpg: number | null; over: number; isWinner: boolean }[];
}

export async function loadManagerCard(articleId: number): Promise<ManagerCardData | null> {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { league: true, type: true, tacticalContext: true } });
  if (!article?.tacticalContext || article.type !== "TACTICAL" || !article.league) return null;
  const ctx = JSON.parse(article.tacticalContext) as TacticalManagerContext;
  if (!ctx.coach || !ctx.record || !ctx.matches?.length) return null; // 경기 전술 글(감독 집계 없음)
  const league = article.league;

  const last = ctx.matches[ctx.matches.length - 1].date;
  const month = last.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const monthFrom = new Date(Date.UTC(y, m - 1, 1));
  const monthTo = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  const seasonFrom = new Date(Date.UTC(m >= 7 ? y : y - 1, 6, 1));

  const rows = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: seasonFrom, lte: monthTo }, homeScore: { not: null }, awayScore: { not: null } },
    select: {
      id: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      predHome: true, predDraw: true, predAway: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  });
  const teamInfo = new Map<number, { nameKo: string; logo: string | null }>();
  for (const r of rows) {
    teamInfo.set(r.homeTeamId, { nameKo: toKoreanTeamName(r.homeTeam.name, league), logo: r.homeTeam.logoUrl });
    teamInfo.set(r.awayTeamId, { nameKo: toKoreanTeamName(r.awayTeam.name, league), logo: r.awayTeam.logoUrl });
  }

  // 시즌 기록·순위 (승점 → 득실차 → 득점)
  const table = new Map<number, CardRecord>();
  const add = (id: number, gf: number, ga: number) => {
    const c = table.get(id) ?? { played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, points: 0 };
    c.played++; c.gf += gf; c.ga += ga;
    if (gf > ga) { c.w++; c.points += 3; } else if (gf === ga) { c.d++; c.points += 1; } else c.l++;
    table.set(id, c);
  };
  for (const r of rows) {
    add(r.homeTeamId, r.homeScore!, r.awayScore!);
    add(r.awayTeamId, r.awayScore!, r.homeScore!);
  }
  const sorted = [...table.entries()].sort((a, b) => b[1].points - a[1].points || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga) || b[1].gf - a[1].gf);
  const seasonRec = table.get(ctx.team.id);
  if (!seasonRec) return null;

  const monthRows = rows.filter((r) => r.startTime >= monthFrom);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rivals = selectionTable(monthRows.map((r) => ({ ...r, homeScore: r.homeScore!, awayScore: r.awayScore! })))
    .filter((t) => t.played >= 3)
    .slice(0, 4)
    .map((t) => ({
      nameKo: teamInfo.get(t.teamId)?.nameKo ?? "",
      logo: teamInfo.get(t.teamId)?.logo ?? null,
      ppg: t.ppg, expectedPpg: t.expectedPpg, over: t.over,
      isWinner: t.teamId === ctx.team.id,
    }));

  const r = ctx.record;
  return {
    league,
    month,
    monthLabel: `${y}년 ${m}월`,
    team: { nameKo: ctx.team.nameKo, logo: teamInfo.get(ctx.team.id)?.logo ?? null },
    coach: { nameKo: ctx.coach.nameKo, photo: ctx.coachPhoto ?? ctx.coach.logo ?? null, formation: ctx.coach.preferredFormation },
    monthRecord: { played: r.played, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, points: r.points, rank: r.rank },
    season: { ...seasonRec, rank: sorted.findIndex(([id]) => id === ctx.team.id) + 1, teams: sorted.length },
    form: ctx.matches.map((mt) => {
      const row = byId.get(mt.matchId);
      const opp = row ? (mt.homeAway === "H" ? row.awayTeam : row.homeTeam) : null;
      return { date: mt.date, opponentKo: mt.opponentKo, opponentLogo: opp?.logoUrl ?? null, homeAway: mt.homeAway, gf: mt.gf, ga: mt.ga, result: mt.result };
    }),
    rivals,
  };
}
