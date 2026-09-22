// GET /api/internal/football-matches-with-ts-mapping?days=2
// Lightsail worker 가 매칭 hint 받는 endpoint.
// 응답: 우리 축구 매치 list + 각 팀의 TheSports team id (매핑 있는 경우만).
//
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readFileSync } from "fs";
import path from "path";
import { SPORTS } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamMapping {
  ourId: number;
  ourExternalId: string;
  tsId: string;
}

interface LeagueMapping {
  code: string;
  tsId: string;
}

let cachedTeamMap: Map<number, string> | null = null;
let cachedLeagueMap: Map<string, string> | null = null;

function loadMappings() {
  if (!cachedTeamMap) {
    const teamFile = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
    const teams: TeamMapping[] = JSON.parse(readFileSync(teamFile, "utf-8"));
    cachedTeamMap = new Map(teams.map((t) => [t.ourId, t.tsId]));
  }
  if (!cachedLeagueMap) {
    const leagueFile = path.join(process.cwd(), "src/lib/sports/thesports/league-id-mapping.json");
    const leagues: LeagueMapping[] = JSON.parse(readFileSync(leagueFile, "utf-8"));
    cachedLeagueMap = new Map(leagues.map((l) => [l.code, l.tsId]));
  }
  return { teamMap: cachedTeamMap, leagueMap: cachedLeagueMap };
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
  const days = Math.max(1, Math.min(7, parseInt(url.searchParams.get("days") ?? "2", 10)));

  const now = new Date();
  const start = new Date(now.getTime() - 12 * 3600 * 1000); // 12h 이전부터 (LIVE 매치 포함)
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;
  const { teamMap, leagueMap } = loadMappings();

  const matches = await prisma.match.findMany({
    where: {
      league: { in: soccerLeagues },
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
      homeTeam: { select: { name: true, externalId: true } },
      awayTeam: { select: { name: true, externalId: true } },
      lineupHome: true,
    },
    orderBy: { startTime: "asc" },
  });

  // ts 가 직접 만든 매치(externalId "ts-…")의 팀은 Team.externalId 가 곧 ts 팀 id 다. 정적 사전(team-id-mapping.json)은
  // af 팀↔ts 팀을 경기 대조로 짝지은 것이라 af 에 없는 대회(아시안게임 U23·여자 등)의 팀이 영영 안 실린다 —
  // 그래서 폴러가 그 대회를 통째로 못 봤다(2026-09-22 실측: 임박 라인업 0, 사후 회전만). 사전 → ts-네이티브 id 순으로 푼다.
  const tsNative = (m: { externalId: string | null }) => (m.externalId ?? "").startsWith("ts-");
  // Team.externalId 는 수집기 세대에 따라 "ts-<id>"(collector) 또는 "<id>"(아시안게임 온보딩 스크립트) — 둘 다 받는다.
  const bareTsId = (v: string | null | undefined): string | null => {
    if (!v) return null;
    const id = v.startsWith("ts-") ? v.slice(3) : v;
    return /^[a-z0-9]{10,24}$/.test(id) && !/^\d+$/.test(id) ? id : null;
  };
  const tsTeamIdOf = (m: { externalId: string | null }, teamId: number, teamExt: string | null) =>
    teamMap.get(teamId) ?? (tsNative(m) ? bareTsId(teamExt) : null);

  const result = matches.map((m) => ({
    matchId: m.id,
    externalId: m.externalId,
    league: m.league,
    tsCompetitionId: leagueMap.get(m.league) ?? null,
    status: m.status,
    startTime: m.startTime.toISOString(),
    // 라인업 이미 저장됨 — poller 의 킥오프 임박(pre-kickoff lineup) 티어가 이 매치를
    // 건너뛰어 슬롯을 아직 못 받은 매치에 양보한다.
    hasLineup: m.lineupHome != null,
    home: {
      name: m.homeTeam.name,
      tsTeamId: tsTeamIdOf(m, m.homeTeamId, m.homeTeam.externalId),
    },
    away: {
      name: m.awayTeam.name,
      tsTeamId: tsTeamIdOf(m, m.awayTeamId, m.awayTeam.externalId),
    },
  }));

  // 양 팀 모두 ts mapping 있는 매치만 worker 가 시도할 수 있음
  const mappable = result.filter((r) => r.home.tsTeamId && r.away.tsTeamId && r.tsCompetitionId);

  return NextResponse.json({
    count: result.length,
    mappableCount: mappable.length,
    matches: mappable,
  });
}
