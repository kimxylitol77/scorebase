import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamDisplayKo, toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { fetchBasketballStandings } from "@/lib/sports/basketball-standings";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Sport = "soccer" | "baseball" | "basketball" | "volleyball" | "hockey";

interface StandingInput {
  teamId: number;
  position: number;
  points: number;
  won: number;
  draw: number;
  loss: number;
  played?: number;
  scored: number | null;
  conceded: number | null;
  difference: number | null;
  group: string | null;
  gamesBehind?: number | null;
  recordExtra?: string | null;
  teamName?: string;
  shortName?: string;
  logoUrl?: string;
}

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
  ["NBA", "basketball"],
  ["WNBA", "basketball"],
  ["KBL", "basketball"],
  ["WKBL", "basketball"],
  ["VNL", "volleyball"],
  ["VNL_W", "volleyball"],
  ["NHL", "hockey"],
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

  let standings: StandingInput[] = [];
  let directUpdatedAt: Date | null = null;
  let stale = false;

  if (sport === "basketball") {
    const basketball = await fetchBasketballStandings(league);
    // 외부 소스 실패 + 마지막 정상 캐시도 없음 → 빈 200 으로 "순위 없음" 처럼 보이면 안 된다.
    if (!basketball) {
      return NextResponse.json(
        {
          status: "unavailable",
          error: "순위 소스 응답 없음 — 마지막 정상 캐시도 비어 있습니다.",
          league,
          sport,
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    directUpdatedAt = basketball.updatedAt;
    stale = basketball.stale ?? false;
    standings = basketball.rows.map((row) => ({
      teamId: row.ourTeamId,
      position: row.position,
      points: row.wins,
      won: row.wins,
      draw: 0,
      loss: row.losses,
      played: row.played,
      scored: row.scored,
      conceded: row.conceded,
      difference: row.difference,
      group: row.group ?? null,
      gamesBehind: row.gamesBehind,
      teamName: row.teamName,
      shortName: row.shortName,
      logoUrl: row.logoUrl,
    }));
  } else if (sport === "volleyball") {
    const groups = await fetchVolleyballTable(league);
    standings = groups.flatMap((group) => group.rows.map((row) => ({
      teamId: row.ourTeamId,
      position: row.position,
      points: row.points,
      won: row.wins,
      draw: 0,
      loss: row.losses,
      played: row.played,
      scored: row.setsWin,
      conceded: row.setsLoss,
      difference: row.setsWin - row.setsLoss,
      group: groups.length > 1 ? group.name : null,
      recordExtra: `${row.setsWin}:${row.setsLoss}`,
    })));
  } else if (sport === "hockey") {
    const [official, nhlTeams] = await Promise.all([
      fetchNhlStandings(),
      prisma.team.findMany({
        where: { league: "NHL" },
        select: { id: true, name: true, shortName: true },
      }),
    ]);
    const byName = new Map(nhlTeams.map((team) => [team.name, team.id]));
    const byAbbrev = new Map(nhlTeams.flatMap((team) => team.shortName ? [[team.shortName, team.id] as const] : []));
    standings = (official?.rows ?? []).flatMap((row, index) => {
      const teamId = byName.get(row.name) ?? byAbbrev.get(row.abbrev);
      if (!teamId) return [];
      return [{
        teamId,
        position: index + 1,
        points: row.points,
        won: row.wins,
        draw: 0,
        loss: row.losses,
        played: row.gamesPlayed,
        scored: row.goalFor,
        conceded: row.goalAgainst,
        difference: row.goalDiff,
        group: null,
        recordExtra: String(row.otLosses),
      }];
    });
  } else {
    const baseball = league === "KBO" || league === "NPB"
      ? await fetchBaseballTable(league)
      : [];
    if (baseball.length > 0) {
      standings = baseball.map((row) => ({
        teamId: row.ourTeamId,
        position: row.position,
        points: row.wins,
        won: row.wins,
        draw: row.draws,
        loss: row.losses,
        played: row.played,
        scored: row.goalsFor,
        conceded: row.goalsAgainst,
        difference: row.goalsFor - row.goalsAgainst,
        group: null,
      }));
    } else {
      standings = (await getFullStandings(league)).map((row) => ({
        teamId: row.teamId,
        position: row.position,
        points: row.points,
        won: row.won,
        draw: row.draw,
        loss: row.loss,
        scored: row.goalsFor ?? null,
        conceded: row.goalsAgainst ?? null,
        difference: row.goalDiff ?? null,
        group: row.group ?? null,
      }));
    }
  }

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
      (left.group ?? "").localeCompare(right.group ?? "")
      || left.position - right.position
      || right.points - left.points,
  );
  const leader = sorted[0];

  const rows = sorted.flatMap((row) => {
    const team = teamById.get(row.teamId);
    if (!team && !row.teamName) return [];
    const played = row.played ?? row.won + row.draw + row.loss;
    const calculatedGamesBehind = leader
      ? Math.max(0, (leader.won - row.won + row.loss - leader.loss) / 2)
      : 0;
    const gamesBehind = row.gamesBehind !== undefined
      ? row.gamesBehind
      : calculatedGamesBehind === 0 ? null : Number(calculatedGamesBehind.toFixed(1));
    return [{
      id: row.teamId,
      position: row.position,
      team: row.teamName
        ? toKoreanTeamName(row.teamName, league)
        : teamDisplayKo(team!, league),
      shortName: row.shortName ?? team?.shortName ?? null,
      logoUrl: row.logoUrl ?? team?.logoUrl ?? null,
      played,
      won: row.won,
      draw: row.draw,
      loss: row.loss,
      scored: row.scored,
      conceded: row.conceded,
      difference: row.difference,
      points: row.points,
      winPct: pct(row.won, row.loss),
      gamesBehind,
      group: row.group,
      recordExtra: row.recordExtra ?? null,
    }];
  });

  const [tsCache, apiCache, latestMatch] = await Promise.all([
    prisma.theSportsStandingsCache.findUnique({
      where: { league },
      select: { updatedAt: true },
    }),
    prisma.apiFootballStandingsCache.findUnique({
      where: { league },
      select: { updatedAt: true },
    }),
    sport === "volleyball"
      ? prisma.match.findFirst({ where: { league, status: "FINISHED" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } })
      : null,
  ]);
  const sourceUpdatedAt = [directUpdatedAt, tsCache?.updatedAt, apiCache?.updatedAt, latestMatch?.updatedAt]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
      // ok = 소스 정상, stale = 소스 실패로 마지막 정상 캐시를 돌려준 상태
      status: stale ? "stale" : "ok",
      league,
      leagueLabel: LEAGUE_DISPLAY[league] ?? league.replaceAll("_", " "),
      sport,
      metric: sport === "soccer" || sport === "volleyball" || sport === "hockey" ? "points" : "winPct",
      rows,
    },
    {
      headers: {
        // stale 응답을 CDN 에 오래 물리면 소스 복구 후에도 옛 순위가 계속 나간다.
        "cache-control": stale
          ? "public, max-age=30, s-maxage=60"
          : "public, max-age=60, s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
