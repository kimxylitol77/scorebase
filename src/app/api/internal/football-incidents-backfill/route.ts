// GET /api/internal/football-incidents-backfill
// 종료 축구 매치 중 cache.detailLive.incidents 가 없어 /scores 점수 hover 팝업
// (골 타임라인·카드)이 안 뜨는 매치 목록 — mac-mini worker 가 TheSports
// /v1/football/match/live/history (uuid 단위, 종료 매치 OK — 2026-06-10 검증)
// 로 백필한 뒤 POST /api/internal/thesports-cache 로 저장한다.
//
// 대상 두 갈래:
//   1) ts- 소스 매치 — externalId 가 곧 ts match id (tsMatchId 로 바로 전달)
//   2) af 소스 매치 (J2 등) — worker 가 diary(tsp=KST자정) + 팀 매핑/이름으로 ts id 탐색
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
    const teams: TeamMapping[] = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json"), "utf-8"),
    );
    cachedTeamMap = new Map(teams.map((t) => [t.ourId, t.tsId]));
  }
  if (!cachedLeagueMap) {
    const leagues: LeagueMapping[] = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/sports/thesports/league-id-mapping.json"), "utf-8"),
    );
    cachedLeagueMap = new Map(leagues.map((l) => [l.code, l.tsId]));
  }
  return { teamMap: cachedTeamMap, leagueMap: cachedLeagueMap };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, parseInt(url.searchParams.get("days") ?? "14", 10)));
  const limit = Math.max(1, Math.min(300, parseInt(url.searchParams.get("limit") ?? "200", 10)));

  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;
  const { teamMap, leagueMap } = loadMappings();

  // cache 가 아예 없거나 detailLive.incidents 가 비어 있는 종료 매치.
  // 종료 90분 후부터 — live 폴링이 막판에 채울 시간 여유.
  const rows: {
    id: number;
    league: string;
    externalId: string | null;
    startTime: Date;
    homeTeamId: number;
    awayTeamId: number;
    homeName: string;
    awayName: string;
  }[] = await prisma.$queryRawUnsafe(
    `SELECT m.id, m.league, m."externalId", m."startTime",
            m."homeTeamId", m."awayTeamId", th.name AS "homeName", ta.name AS "awayName"
     FROM "Match" m
     JOIN "Team" th ON th.id = m."homeTeamId"
     JOIN "Team" ta ON ta.id = m."awayTeamId"
     LEFT JOIN "TheSportsMatchCache" c ON c."matchId" = m.id
     WHERE m.status = 'FINISHED'
       AND m.league = ANY($1)
       AND m."startTime" > now() - ($2 || ' days')::interval
       AND m."startTime" < now() - interval '90 minutes'
       AND (c."matchId" IS NULL
            OR c."detailLive" IS NULL
            OR jsonb_typeof(c."detailLive"->'incidents') IS DISTINCT FROM 'array'
            OR jsonb_array_length(c."detailLive"->'incidents') = 0
            OR jsonb_typeof(c.lineup) IS DISTINCT FROM 'object')
     ORDER BY m."startTime" DESC
     LIMIT $3`,
    soccerLeagues,
    String(days),
    limit,
  );

  // 어떤 보강이 필요한지 플래그 — worker 가 필요한 endpoint 만 호출 (rate 절약).
  const flagRows: { id: number; needIncidents: boolean; needLineup: boolean }[] =
    rows.length > 0
      ? await prisma.$queryRawUnsafe(
          `SELECT m.id,
             (c."matchId" IS NULL OR c."detailLive" IS NULL
              OR jsonb_typeof(c."detailLive"->'incidents') IS DISTINCT FROM 'array'
              OR jsonb_array_length(c."detailLive"->'incidents') = 0) AS "needIncidents",
             (c."matchId" IS NULL OR jsonb_typeof(c.lineup) IS DISTINCT FROM 'object') AS "needLineup"
           FROM "Match" m
           LEFT JOIN "TheSportsMatchCache" c ON c."matchId" = m.id
           WHERE m.id = ANY($1)`,
          rows.map((r) => r.id),
        )
      : [];
  const flagById = new Map(flagRows.map((f) => [f.id, f]));

  const matches = rows.map((m) => ({
    matchId: m.id,
    league: m.league,
    startTimeMs: m.startTime.getTime(),
    tsMatchId: m.externalId?.startsWith("ts-") ? m.externalId.slice(3) : null,
    homeName: m.homeName,
    awayName: m.awayName,
    homeTsTeamId: teamMap.get(m.homeTeamId) ?? null,
    awayTsTeamId: teamMap.get(m.awayTeamId) ?? null,
    tsCompetitionId: leagueMap.get(m.league) ?? null,
    needIncidents: flagById.get(m.id)?.needIncidents ?? true,
    needLineup: flagById.get(m.id)?.needLineup ?? true,
  }));

  return NextResponse.json({ count: matches.length, matches });
}
