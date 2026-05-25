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
//   1) DB TeamSourceId (source='thesports') 우선 lookup. 없으면 mapping JSON fallback.
//      미매핑이면 매치 skip.
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

interface TeamMapEntry { ourId: number; tsId: string }

// JSON fallback — DB TeamSourceId 미커버 ts entry 보완용.
let cachedFootballJsonMap: Map<string, number> | null = null;
let cachedBaseballJsonMap: Map<string, number> | null = null;

function loadFootballJsonReverse(): Map<string, number> {
  if (cachedFootballJsonMap) return cachedFootballJsonMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  try {
    const arr: TeamMapEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    cachedFootballJsonMap = new Map(arr.map((t) => [t.tsId, t.ourId]));
  } catch {
    cachedFootballJsonMap = new Map();
  }
  return cachedFootballJsonMap;
}

function loadBaseballJsonReverse(): Map<string, number> {
  if (cachedBaseballJsonMap) return cachedBaseballJsonMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json");
  try {
    const arr: TeamMapEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    cachedBaseballJsonMap = new Map(arr.map((t) => [t.tsId, t.ourId]));
  } catch {
    cachedBaseballJsonMap = new Map();
  }
  return cachedBaseballJsonMap;
}

/** 이번 batch 의 tsTeamId 들을 한 번에 TeamSourceId 에서 fetch — Map<"league|ext", teamId>. */
async function loadDbMapForBatch(
  matches: MatchPayload[],
): Promise<Map<string, number>> {
  const byLeague = new Map<string, Set<string>>();
  for (const m of matches) {
    if (!byLeague.has(m.league)) byLeague.set(m.league, new Set());
    byLeague.get(m.league)!.add(m.tsHomeTeamId);
    byLeague.get(m.league)!.add(m.tsAwayTeamId);
  }
  const result = new Map<string, number>();
  for (const [league, exts] of byLeague) {
    if (exts.size === 0) continue;
    const rows = await prisma.teamSourceId.findMany({
      where: {
        league,
        source: "thesports",
        externalId: { in: [...exts] },
      },
      select: { externalId: true, teamId: true },
    });
    for (const r of rows) {
      result.set(`${league}|${r.externalId}`, r.teamId);
    }
  }
  return result;
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

  // DB TeamSourceId 우선 lookup (league + source='thesports' + tsTeamId)
  const dbMap = await loadDbMapForBatch(body.matches);
  // JSON fallback — DB 에 없는 ts entry 보완
  const jsonMap =
    body.sport === "football"
      ? loadFootballJsonReverse()
      : loadBaseballJsonReverse();

  function resolveTsTeamId(league: string, tsTeamId: string): number | undefined {
    return dbMap.get(`${league}|${tsTeamId}`) ?? jsonMap.get(tsTeamId);
  }

  let upserted = 0;
  let skippedNoTeam = 0;
  let skippedDuplicate = 0;

  for (const m of body.matches) {
    const homeId = resolveTsTeamId(m.league, m.tsHomeTeamId);
    const awayId = resolveTsTeamId(m.league, m.tsAwayTeamId);
    if (!homeId || !awayId) {
      skippedNoTeam++;
      continue;
    }
    // externalId prefix "ts:" 로 ESPN/API-Sports 와 namespace 분리 — duplicate 방지
    const externalId = `ts:${m.tsMatchId}`;
    try {
      // ── 근본 dedup: 같은 매치를 다른 source (api-football/ESPN) 가 이미 등록했는지 체크.
      // SKIP_LEAGUES (worker 단) 가 누락한 리그도 여기서 차단 — worker 재배포 안 해도 효과.
      // 조건: 같은 league + 시각 ±90분 + 팀 IDs (양방향) + externalId 가 ts: 아님.
      // 이미 ts: 매치 있으면 update path (where 절) 로 흘러가니 skip 필요 없음.
      const startMs = new Date(m.startTime).getTime();
      const existingNonTs = await prisma.match.findFirst({
        where: {
          league: m.league,
          startTime: {
            gte: new Date(startMs - 90 * 60 * 1000),
            lte: new Date(startMs + 90 * 60 * 1000),
          },
          OR: [
            { homeTeamId: homeId, awayTeamId: awayId },
            { homeTeamId: awayId, awayTeamId: homeId },
          ],
          NOT: { externalId: { startsWith: "ts:" } },
        },
        select: { id: true, externalId: true },
      });
      if (existingNonTs) {
        skippedDuplicate++;
        continue;
      }

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
    skippedDuplicate,
    received: body.matches.length,
  });
}
