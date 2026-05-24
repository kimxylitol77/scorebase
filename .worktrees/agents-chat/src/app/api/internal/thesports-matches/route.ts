// POST /api/internal/thesports-matches
// Lightsail worker 가 TheSports diary (football|baseball) 응답을 batch upsert.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// Body:
//   {
//     sport: "football" | "baseball",
//     matches: Array<{
//       league: string,           // 우리 league code (CSL/EPL/KBO/NPB/MLB/...)
//       tsMatchId: string,        // TheSports match id (e.g. "4jwq26sw61g9r0v")
//       tsHomeTeamId: string,
//       tsAwayTeamId: string,
//       startTime: string,        // ISO
//       status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED",
//       homeScore?: number,
//       awayScore?: number,
//     }>
//   }
//
// 흐름:
//   1) team-id-mapping.json (football) 또는 baseball-team-id-mapping.json reverse map 으로
//      tsTeamId → 우리 Team.id resolve. 미매핑이면 매치 skip.
//   2) league + tsMatchId 가 externalId 로 match upsert.

import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MatchPayload {
  league: string;
  tsMatchId: string;
  tsHomeTeamId: string;
  tsAwayTeamId: string;
  startTime: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  homeScore?: number;
  awayScore?: number;
}
interface Body {
  sport: "football" | "baseball";
  matches: MatchPayload[];
}

interface TeamMap { ourId: number; tsId: string }

// 모듈 캐시 — 호출당 파일 읽기 회피
let cachedFootballMap: Map<string, number> | null = null;
let cachedBaseballMap: Map<string, number> | null = null;

function loadFootballReverse(): Map<string, number> {
  if (cachedFootballMap) return cachedFootballMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const arr: TeamMap[] = JSON.parse(readFileSync(file, "utf-8"));
  cachedFootballMap = new Map(arr.map((t) => [t.tsId, t.ourId]));
  return cachedFootballMap;
}

function loadBaseballReverse(): Map<string, number> {
  if (cachedBaseballMap) return cachedBaseballMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json");
  try {
    const arr: TeamMap[] = JSON.parse(readFileSync(file, "utf-8"));
    cachedBaseballMap = new Map(arr.map((t) => [t.tsId, t.ourId]));
  } catch {
    cachedBaseballMap = new Map();
  }
  return cachedBaseballMap;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.sport !== "football" && body.sport !== "baseball") {
    return NextResponse.json({ error: "sport must be football | baseball" }, { status: 400 });
  }
  if (!Array.isArray(body.matches)) {
    return NextResponse.json({ error: "matches array required" }, { status: 400 });
  }

  const teamMap = body.sport === "football" ? loadFootballReverse() : loadBaseballReverse();
  let upserted = 0;
  let skippedNoTeam = 0;

  for (const m of body.matches) {
    const homeId = teamMap.get(m.tsHomeTeamId);
    const awayId = teamMap.get(m.tsAwayTeamId);
    if (!homeId || !awayId) {
      skippedNoTeam++;
      continue;
    }
    // externalId prefix "ts:" 로 ESPN/API-Sports 와 namespace 분리 — duplicate 방지
    const externalId = `ts:${m.tsMatchId}`;
    try {
      await prisma.match.upsert({
        where: { league_externalId: { league: m.league, externalId } },
        update: {
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeScore: m.homeScore ?? null,
          awayScore: m.awayScore ?? null,
          status: m.status,
          startTime: new Date(m.startTime),
        },
        create: {
          league: m.league,
          externalId,
          homeTeamId: homeId,
          awayTeamId: awayId,
          homeScore: m.homeScore ?? null,
          awayScore: m.awayScore ?? null,
          status: m.status,
          startTime: new Date(m.startTime),
        },
      });
      upserted++;
    } catch (e) {
      console.warn(`[ts-matches] upsert fail ${m.league}/${m.tsMatchId}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skippedNoTeam,
    received: body.matches.length,
  });
}
