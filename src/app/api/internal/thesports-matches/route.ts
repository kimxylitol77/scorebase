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

// 팀 이름 normalize 비교 (Team 중복 row 대응 — LALIGA Barcelona 4 row 같은 케이스).
function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
function sameTeamName(a: string, b: string): boolean {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}
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
  sport: "football" | "baseball" | "ice_hockey";
  matches: MatchPayload[];
}

interface TeamMapEntry { ourId: number; tsId: string }

// JSON fallback — DB TeamSourceId 미커버 ts entry 보완용.
let cachedFootballJsonMap: Map<string, number> | null = null;
let cachedBaseballJsonMap: Map<string, number> | null = null;
let cachedIceHockeyJsonMap: Map<string, number> | null = null;

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

function loadIceHockeyJsonReverse(): Map<string, number> {
  if (cachedIceHockeyJsonMap) return cachedIceHockeyJsonMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/ice-hockey-team-id-mapping.json");
  try {
    const arr: TeamMapEntry[] = JSON.parse(readFileSync(file, "utf-8"));
    cachedIceHockeyJsonMap = new Map(arr.map((t) => [t.tsId, t.ourId]));
  } catch {
    cachedIceHockeyJsonMap = new Map();
  }
  return cachedIceHockeyJsonMap;
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
  if (body.sport !== "football" && body.sport !== "baseball" && body.sport !== "ice_hockey") {
    return NextResponse.json({ error: "sport must be football | baseball | ice_hockey" }, { status: 400 });
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
      : body.sport === "baseball"
        ? loadBaseballJsonReverse()
        : loadIceHockeyJsonReverse();

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
      // ts team mapping 없음 — 매치 row 못 만듦. 다만 같은 league + 시각 ±90분 안에
      // non-ts 매치 (api-football/ESPN 가 만든 매치) 가 unique 하면 ts cache 만 연결.
      // 그러면 fast-poller 가 그 매치 incidents/score 채워 GoalsTooltip 활성.
      // 2026-05-25: 50% 매치 cache 누락 (사용자 신고 hover tooltip 안 뜸) 해소.
      try {
        const startMs = new Date(m.startTime).getTime();
        const candidates = await prisma.match.findMany({
          where: {
            league: m.league,
            startTime: {
              gte: new Date(startMs - 90 * 60 * 1000),
              lte: new Date(startMs + 90 * 60 * 1000),
            },
            NOT: { externalId: { startsWith: "ts-" } },
          },
          select: { id: true },
        });
        // unique candidate (= 같은 시각 매치 1개만) 일 때만 안전하게 매핑.
        // EPL 시즌 마지막 라운드 10경기 동시 같은 케이스는 모호해서 skip.
        if (candidates.length === 1) {
          await prisma.theSportsMatchCache.upsert({
            where: { matchId: candidates[0].id },
            update: { tsMatchId: m.tsMatchId },
            create: {
              matchId: candidates[0].id,
              tsMatchId: m.tsMatchId,
              detailLive: {},
            },
          });
        }
      } catch {
        // silent — 다음 cycle 재시도
      }
      skippedNoTeam++;
      continue;
    }
    // externalId prefix "ts-" 로 ESPN/API-Sports 와 namespace 분리 — duplicate 방지.
    // 2026-05-25: ":" → "-" 변경 — Next.js dynamic route segment 가 URL 안 ":" 처리
    // 못해 /live/[league]/[gameId] 페이지 404 됐던 문제 fix.
    const externalId = `ts-${m.tsMatchId}`;
    try {
      // ── 근본 dedup: 같은 매치를 다른 source (api-football/ESPN) 가 이미 등록했는지 체크.
      // SKIP_LEAGUES (worker 단) 가 누락한 리그도 여기서 차단 — worker 재배포 안 해도 효과.
      // 조건: 같은 league + 시각 ±90분 + 팀 IDs (양방향) + externalId 가 ts- 아님.
      // 이미 ts: 매치 있으면 update path (where 절) 로 흘러가니 skip 필요 없음.
      const startMs = new Date(m.startTime).getTime();
      let existingNonTs = await prisma.match.findFirst({
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
          NOT: { externalId: { startsWith: "ts-" } },
        },
        select: { id: true, externalId: true },
      });

      // fallback: team-id 매칭 실패 시 이름 normalize 매칭. Team 중복 row 케이스
      // (LALIGA Barcelona 4 row, EPL Team.externalId 시스템 mismatch) 잡음. 2026-05-25.
      if (!existingNonTs) {
        const homeTeam = await prisma.team.findUnique({ where: { id: homeId }, select: { name: true } });
        const awayTeam = await prisma.team.findUnique({ where: { id: awayId }, select: { name: true } });
        if (homeTeam && awayTeam) {
          const candidates = await prisma.match.findMany({
            where: {
              league: m.league,
              startTime: {
                gte: new Date(startMs - 90 * 60 * 1000),
                lte: new Date(startMs + 90 * 60 * 1000),
              },
              NOT: { externalId: { startsWith: "ts-" } },
            },
            select: {
              id: true,
              externalId: true,
              homeTeam: { select: { name: true } },
              awayTeam: { select: { name: true } },
            },
          });
          existingNonTs = candidates.find((c) =>
            (sameTeamName(c.homeTeam.name, homeTeam.name) && sameTeamName(c.awayTeam.name, awayTeam.name)) ||
            (sameTeamName(c.homeTeam.name, awayTeam.name) && sameTeamName(c.awayTeam.name, homeTeam.name)),
          ) ?? null;
        }
      }

      if (existingNonTs) {
        skippedDuplicate++;
        // SKIP_LEAGUES (api-football 이 매치 row 만드는 리그) 매치도 fast-poller 가
        // detail_live 의 incidents/score 채울 수 있게 ts cache row 만 만든다.
        // 매치 row 는 api-football 것 유지 — 중복 안 만듦.
        try {
          await prisma.theSportsMatchCache.upsert({
            where: { matchId: existingNonTs.id },
            update: { tsMatchId: m.tsMatchId },
            create: {
              matchId: existingNonTs.id,
              tsMatchId: m.tsMatchId,
              detailLive: {},
            },
          });
        } catch (e) {
          // schema FK 또는 unique 충돌 silent — 다음 cycle 에서 재시도
        }
        continue;
      }

      // 단조 progression 가드 — 30분 주기 collector 가 detail_live 의 stale/wrong
      // status (e.g. baseball 100 = FINISHED 인데 구버전 mapper 가 SCHEDULED 로 잘못
      // 매핑한 케이스) 로 fresh FINISHED 매치를 SCHEDULED 로 revert + score null
      // 덮어쓰는 사고 차단 (2026-05-27 LMB 5/27 매치 매 30분 revert).
      // POSTPONED 는 어디서나 진입 허용 (matchday cancel).
      const STATUS_RANK = { SCHEDULED: 0, LIVE: 1, FINISHED: 2, POSTPONED: 2 } as const;
      const existing = await prisma.match.findUnique({
        where: { league_externalId: { league: m.league, externalId } },
        select: { status: true, homeScore: true, awayScore: true },
      });
      const incomingRank = STATUS_RANK[m.status];
      const allowStatus =
        !existing ||
        m.status === "POSTPONED" ||
        incomingRank >= (STATUS_RANK[existing.status as keyof typeof STATUS_RANK] ?? 0);
      // score 가 null/undefined 로 들어오면 기존 값 보존 (cache 로 채워진 fresh score
      // 덮어쓰지 않게). 명시적 숫자만 update.
      const updateData: Record<string, unknown> = {
        homeTeamId: homeId,
        awayTeamId: awayId,
        startTime: new Date(m.startTime),
      };
      if (allowStatus) updateData.status = m.status;
      if (typeof m.homeScore === "number") updateData.homeScore = m.homeScore;
      if (typeof m.awayScore === "number") updateData.awayScore = m.awayScore;

      await prisma.match.upsert({
        where: { league_externalId: { league: m.league, externalId } },
        update: updateData,
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
