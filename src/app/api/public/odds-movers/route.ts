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
type Market = "h2h" | "handicap" | "totals";
type Side = "home" | "draw" | "away";
type Point = { home: number; draw: number | null; away: number };
type RawBook = {
  nm: string;
  h?: number;
  d?: number | null;
  a?: number;
  hl?: number;
  hh?: number;
  ha?: number;
  tl?: number;
  ov?: number;
  un?: number;
};

const HOUR = 60 * 60 * 1000;
const SPORT_CONFIG: Record<Sport, { leagues: Set<string>; hasDraw: boolean }> = {
  soccer: { leagues: SOCCER_LEAGUES as Set<string>, hasDraw: true },
  baseball: { leagues: BASEBALL_LEAGUES as Set<string>, hasDraw: false },
  basketball: { leagues: BASKETBALL_LEAGUES as Set<string>, hasDraw: false },
};

function sportFrom(value: string | null): Sport {
  return value === "baseball" || value === "basketball" ? value : "soccer";
}

function marketFrom(value: string | null): Market {
  return value === "handicap" || value === "totals" ? value : "h2h";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function rawBooks(value: unknown): RawBook[] {
  if (!isRecord(value)) return [];
  const books = value.books;
  if (!Array.isArray(books)) return [];
  const numberValue = (item: unknown) => typeof item === "number" && Number.isFinite(item) ? item : undefined;
  return books.flatMap((book) => {
    if (!isRecord(book) || typeof book.nm !== "string") return [];
    return [{
      nm: book.nm.slice(0, 60),
      h: numberValue(book.h),
      d: numberValue(book.d) ?? null,
      a: numberValue(book.a),
      hl: numberValue(book.hl),
      hh: numberValue(book.hh),
      ha: numberValue(book.ha),
      tl: numberValue(book.tl),
      ov: numberValue(book.ov),
      un: numberValue(book.un),
    }];
  });
}

function sameLine(left: number | undefined, right: number | null, absolute = false) {
  if (left == null || right == null) return false;
  const a = absolute ? Math.abs(left) : left;
  const b = absolute ? Math.abs(right) : right;
  return Math.abs(a - b) < 0.001;
}

function inferHandicapLine(books: RawBook[], storedLine: number | null) {
  const candidates = books
    .map((book) => book.hl)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .filter((value) => storedLine == null || sameLine(value, storedLine, true));
  if (candidates.length) {
    const counts = new Map<number, number>();
    for (const value of candidates) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  if (storedLine == null) return null;
  return storedLine < 0 ? storedLine : -storedLine;
}

function openingPoint(value: unknown, market: Market, activeLine: number | null): Point | null {
  if (market === "h2h" || !isRecord(value) || !isRecord(value.opening)) return null;
  const item = value.opening[market];
  if (!isRecord(item)) return null;
  if (typeof item.home !== "number" || typeof item.away !== "number") return null;
  const storedLine = typeof item.line === "number" ? item.line : null;
  if (activeLine != null && storedLine != null && !sameLine(storedLine, activeLine, market === "handicap")) return null;
  return { home: item.home, draw: null, away: item.away };
}

function sanitizedBooks(value: unknown, market: Market, hasDraw: boolean, activeLine: number | null) {
  const books = rawBooks(value);
  return books.flatMap((row) => {
    if (market === "h2h") {
      if (typeof row.h !== "number" || typeof row.a !== "number") return [];
      return [{
        name: row.nm.slice(0, 60),
        home: row.h,
        draw: hasDraw && typeof row.d === "number" ? row.d : null,
        away: row.a,
      }];
    }
    if (market === "handicap") {
      if (!sameLine(row.hl, activeLine) || typeof row.hh !== "number" || typeof row.ha !== "number") return [];
      return [{ name: row.nm.slice(0, 60), home: row.hh, draw: null, away: row.ha }];
    }
    if (!sameLine(row.tl, activeLine) || typeof row.ov !== "number" || typeof row.un !== "number") return [];
    return [{ name: row.nm.slice(0, 60), home: row.ov, draw: null, away: row.un }];
  }).slice(0, 30);
}

function signedLine(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

export async function GET(request: NextRequest) {
  const sport = sportFrom(request.nextUrl.searchParams.get("sport"));
  const market = marketFrom(request.nextUrl.searchParams.get("market"));
  const config = SPORT_CONFIG[sport];
  const hasDraw = market === "h2h" && config.hasDraw;
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
  const snapshots = market === "h2h" && ids.length
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

  const pointsByMatch = new Map<number, Array<Point & { fetchedAt?: Date }>>();
  if (market === "h2h") {
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
  }

  const rows = matches.flatMap((match) => {
    const books = rawBooks(match.oddsBookmakers);
    const activeLine = market === "handicap"
      ? inferHandicapLine(books, match.oddsHcLine)
      : market === "totals"
        ? match.oddsTotalLine
        : null;
    const current = market === "h2h"
      ? { home: match.oddsHome, draw: match.oddsDraw, away: match.oddsAway }
      : market === "handicap"
        ? { home: match.oddsHcHome, draw: null, away: match.oddsHcAway }
        : { home: match.oddsOver, draw: null, away: match.oddsUnder };
    const points = pointsByMatch.get(match.id) ?? [];
    const opening = openingPoint(match.oddsBookmakers, market, activeLine);
    if (opening && current.home != null && current.away != null) {
      points.push(opening, { home: current.home, draw: null, away: current.away });
    }
    const home = line(points, "home", current.home);
    const draw = hasDraw ? line(points, "draw", current.draw) : null;
    const away = line(points, "away", current.away);
    if (home.currentOdds == null && away.currentOdds == null) return [];
    const movements = [home, draw, away]
      .filter((item): item is NonNullable<typeof item> => item != null && item.sampleCount >= 2)
      .map((item) => item.deltaPct);

    const outcomeLabels = market === "h2h"
      ? { home: "홈승", draw: hasDraw ? "무승부" : null, away: "원정승" }
      : market === "handicap" && activeLine != null
        ? { home: `홈 ${signedLine(activeLine)}`, draw: null, away: `원정 ${signedLine(-activeLine)}` }
        : market === "totals" && activeLine != null
          ? { home: `오버 ${activeLine}`, draw: null, away: `언더 ${activeLine}` }
          : { home: market === "handicap" ? "홈 핸디" : "오버", draw: null, away: market === "handicap" ? "원정 핸디" : "언더" };

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
      market,
      line: activeLine,
      outcomeLabels,
      outcomes: { home, draw, away },
      movementPct: movements.length ? Math.min(...movements) : 0,
      bookmakers: sanitizedBooks(match.oddsBookmakers, market, hasDraw, activeLine),
      bookmakerCount: match.marketBookmakers ?? 0,
      updatedAt: points.at(-1)?.fetchedAt?.toISOString() ?? match.marketUpdatedAt?.toISOString() ?? null,
    }];
  });

  rows.sort((a, b) => a.movementPct - b.movementPct || a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      sport,
      market,
      hasDraw,
      matches: rows,
    },
    {
      headers: {
        "cache-control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}
