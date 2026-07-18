import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Sport = "soccer" | "baseball" | "basketball" | "volleyball";

const LEAGUES = new Map<string, Sport>([
  ["EPL", "soccer"],
  ["MLS", "soccer"],
  ["LALIGA", "soccer"],
  ["BUNDESLIGA", "soccer"],
  ["SERIE_A", "soccer"],
  ["LIGUE_1", "soccer"],
  ["EREDIVISIE", "soccer"],
  ["UCL", "soccer"],
  ["UEL", "soccer"],
  ["K_LEAGUE_1", "soccer"],
  ["K_LEAGUE_2", "soccer"],
  ["MLB", "baseball"],
  ["NPB", "baseball"],
  ["KBO", "baseball"],
  ["WNBA", "basketball"],
  ["KBL", "basketball"],
  ["WKBL", "basketball"],
  ["VNL", "volleyball"],
  ["VNL_W", "volleyball"],
]);

function pct(wins: number, losses: number) {
  const decisions = wins + losses;
  return decisions > 0 ? Number((wins / decisions).toFixed(3)) : null;
}

export async function GET(request: NextRequest) {
  const league = (request.nextUrl.searchParams.get("league") ?? "EPL").toUpperCase();
  const sport = LEAGUES.get(league);
  if (!sport) {
    return NextResponse.json({ error: "unsupported league" }, { status: 400 });
  }

  const baseball = league === "KBO" || league === "NPB"
    ? await fetchBaseballTable(league)
    : [];
  const standings = baseball.length > 0
    ? baseball.map((row) => ({
        teamId: row.ourTeamId,
        position: row.position,
        points: row.wins,
        won: row.wins,
        draw: row.draws,
        loss: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalsFor - row.goalsAgainst,
        group: null,
      }))
    : await getFullStandings(league);

  const teamIds = standings.map((row) => row.teamId);
  const teams = teamIds.length > 0
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, nameKo: true, shortName: true, logoUrl: true },
      })
    : [];
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const sorted = [...standings].sort(
    (left, right) =>
      (left.group ?? "").localeCompare(right.group ?? "") ||
      left.position - right.position ||
      right.points - left.points,
  );
  const leader = sorted[0];

  const rows = sorted.flatMap((row) => {
    const team = teamById.get(row.teamId);
    if (!team) return [];
    const played = row.won + row.draw + row.loss;
    const gamesBehind = leader
      ? Math.max(0, (leader.won - row.won + row.loss - leader.loss) / 2)
      : 0;
    return [{
      id: row.teamId,
      position: row.position,
      team: toKoreanTeamName(team.nameKo || team.name, league),
      shortName: team.shortName,
      logoUrl: team.logoUrl,
      played,
      won: row.won,
      draw: row.draw,
      loss: row.loss,
      scored: row.goalsFor ?? null,
      conceded: row.goalsAgainst ?? null,
      difference: row.goalDiff ?? null,
      points: row.points,
      winPct: pct(row.won, row.loss),
      gamesBehind: gamesBehind === 0 ? null : Number(gamesBehind.toFixed(1)),
      group: row.group ?? null,
    }];
  });

  const [tsCache, apiCache] = await Promise.all([
    prisma.theSportsStandingsCache.findUnique({
      where: { league },
      select: { updatedAt: true },
    }),
    prisma.apiFootballStandingsCache.findUnique({
      where: { league },
      select: { updatedAt: true },
    }),
  ]);
  const sourceUpdatedAt = [tsCache?.updatedAt, apiCache?.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
      league,
      leagueLabel: LEAGUE_DISPLAY[league] ?? league.replaceAll("_", " "),
      sport,
      metric: sport === "soccer" || sport === "volleyball" ? "points" : "winPct",
      rows,
    },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
