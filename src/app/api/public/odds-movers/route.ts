import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
  LEAGUE_DISPLAY,
  SOCCER_LEAGUES,
} from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Sport = "soccer" | "baseball" | "basketball";
type Side = "home" | "draw" | "away";
type Point = { home: number; draw: number | null; away: number };

const HOUR = 60 * 60 * 1000;
const SPORT_CONFIG: Record<Sport, { leagues: Set<string>; hasDraw: boolean }> = {
  soccer: { leagues: SOCCER_LEAGUES as Set<string>, hasDraw: true },
  baseball: { leagues: BASEBALL_LEAGUES as Set<string>, hasDraw: false },
  basketball: { leagues: BASKETBALL_LEAGUES as Set<string>, hasDraw: false },
};

function sportFrom(value: string | null): Sport {
  return value === "baseball" || value === "basketball" ? value : "soccer";
}

function line(points: Point[], side: Side, fallback: number | null) {
  const values = points
    .map((point) => point[side])
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const openOdds = values[0] ?? null;
  const currentOdds = values.at(-1) ?? fallback;
  const deltaPct = openOdds != null && currentOdds != null
    ? ((currentOdds - openOdds) / openOdds) * 100
    : 0;
  return {
    openOdds,
    currentOdds,
    deltaPct: Math.round(deltaPct * 10) / 10,
    sampleCount: values.length,
  };
}

function sanitizedBooks(value: unknown, hasDraw: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const books = (value as { books?: unknown }).books;
  if (!Array.isArray(books)) return [];
  return books.flatMap((book) => {
    if (!book || typeof book !== "object" || Array.isArray(book)) return [];
    const row = book as Record<string, unknown>;
    if (typeof row.nm !== "string" || typeof row.h !== "number" || typeof row.a !== "number") return [];
    return [{
      name: row.nm.slice(0, 60),
      home: row.h,
      draw: hasDraw && typeof row.d === "number" ? row.d : null,
      away: row.a,
    }];
  }).slice(0, 30);
}

export async function GET(request: NextRequest) {
  const sport = sportFrom(request.nextUrl.searchParams.get("sport"));
  const config = SPORT_CONFIG[sport];
  const now = new Date();
  const until = new Date(now.getTime() + 72 * HOUR);
  const since = new Date(now.getTime() - 96 * HOUR);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: Array.from(config.leagues) },
      status: "SCHEDULED",
      startTime: { gte: now, lte: until },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ startTime: "asc" }],
    take: 240,
  });

  const ids = matches.map((match) => match.id);
  const snapshots = ids.length
    ? await prisma.oddsSnapshot.findMany({
        where: { matchId: { in: ids }, fetchedAt: { gte: since } },
        orderBy: { fetchedAt: "asc" },
        select: {
          matchId: true,
          homeOdds: true,
          drawOdds: true,
          awayOdds: true,
          fetchedAt: true,
        },
      })
    : [];

  const pointsByMatch = new Map<number, Array<Point & { fetchedAt: Date }>>();
  for (const snapshot of snapshots) {
    const points = pointsByMatch.get(snapshot.matchId) ?? [];
    points.push({
      home: snapshot.homeOdds,
      draw: snapshot.drawOdds,
      away: snapshot.awayOdds,
      fetchedAt: snapshot.fetchedAt,
    });
    pointsByMatch.set(snapshot.matchId, points);
  }

  const rows = matches.flatMap((match) => {
    const points = pointsByMatch.get(match.id) ?? [];
    const home = line(points, "home", match.oddsHome);
    const draw = config.hasDraw ? line(points, "draw", match.oddsDraw) : null;
    const away = line(points, "away", match.oddsAway);
    if (home.currentOdds == null && away.currentOdds == null) return [];
    const movements = [home, draw, away]
      .filter((item): item is NonNullable<typeof item> => item != null && item.sampleCount >= 2)
      .map((item) => item.deltaPct);

    return [{
      id: match.id,
      league: match.league,
      leagueLabel: LEAGUE_DISPLAY[match.league] ?? match.league.replaceAll("_", " "),
      sport,
      startTime: match.startTime.toISOString(),
      homeTeam: toKoreanTeamName(match.homeTeam.name, match.league),
      awayTeam: toKoreanTeamName(match.awayTeam.name, match.league),
      homeLogo: match.homeTeam.logoUrl,
      awayLogo: match.awayTeam.logoUrl,
      outcomes: { home, draw, away },
      movementPct: movements.length ? Math.min(...movements) : 0,
      bookmakers: sanitizedBooks(match.oddsBookmakers, config.hasDraw),
      bookmakerCount: match.marketBookmakers ?? 0,
      updatedAt: points.at(-1)?.fetchedAt.toISOString() ?? match.marketUpdatedAt?.toISOString() ?? null,
    }];
  });

  rows.sort((a, b) => a.movementPct - b.movementPct || a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      sport,
      hasDraw: config.hasDraw,
      matches: rows,
    },
    {
      headers: {
        "cache-control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}
