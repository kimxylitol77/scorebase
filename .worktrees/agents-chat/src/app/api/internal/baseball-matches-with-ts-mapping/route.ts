// GET /api/internal/baseball-matches-with-ts-mapping?days=1
// Lightsail baseball-poller 가 매칭 hint 받는 endpoint.
// 응답: 우리 야구 매치 list (KBO/NPB/MLB) + 각 팀의 TheSports team id (매핑 있는 경우만).
//
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFileSync } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamMapping {
  ourId: number;
  ourName: string;
  ourLeague: string;
  ourExternalId: string;
  tsId: string;
  tsName: string;
}

let cachedTeamMap: Map<number, string> | null = null;

function loadTeamMap(): Map<number, string> {
  if (cachedTeamMap) return cachedTeamMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json");
  const teams: TeamMapping[] = JSON.parse(readFileSync(file, "utf-8"));
  cachedTeamMap = new Map(teams.map((t) => [t.ourId, t.tsId]));
  return cachedTeamMap;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(3, parseInt(url.searchParams.get("days") ?? "1", 10)));

  const now = new Date();
  const start = new Date(now.getTime() - 12 * 3600 * 1000); // 12h 이전부터 (LIVE/지연 매치 포함)
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const teamMap = loadTeamMap();

  const matches = await prisma.match.findMany({
    where: {
      league: { in: ["KBO", "NPB", "MLB"] },
      startTime: { gte: start, lt: end },
      status: { in: ["SCHEDULED", "LIVE"] },
    },
    select: {
      id: true,
      externalId: true,
      league: true,
      status: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const result = matches.map((m) => ({
    matchId: m.id,
    externalId: m.externalId,
    league: m.league,
    status: m.status,
    startTime: m.startTime.toISOString(),
    home: {
      name: m.homeTeam.name,
      tsTeamId: teamMap.get(m.homeTeamId) ?? null,
    },
    away: {
      name: m.awayTeam.name,
      tsTeamId: teamMap.get(m.awayTeamId) ?? null,
    },
  }));

  const mappable = result.filter((r) => r.home.tsTeamId && r.away.tsTeamId);

  return NextResponse.json({
    count: result.length,
    mappableCount: mappable.length,
    matches: mappable,
  });
}
