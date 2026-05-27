// TheSports standings cache 에서 팀별 리그 순위 추출.
// 매치 카드에 "[14]" 같은 [순위] 표시할 때 사용.
//
// 흐름:
//   1) prisma.theSportsStandingsCache.findUnique({ league })
//   2) payload.tables[0].rows[].team_id + position 추출
//   3) team-id-mapping.json 로 ts team_id → 우리 Team.id 변환
//   4) Map<our Team.id, position> 반환
//
// 캐싱: in-process 5분. /scores 페이지 한 요청에서 여러 매치 카드 호출 시 효율.

import { prisma } from "@/lib/db";
import teamIdMapping from "./team-id-mapping.json";

interface TeamIdEntry {
  ourId: number;
  tsId: string;
  ourLeague: string;
}

interface StandingsTable {
  rows?: Array<{
    team_id?: string;
    position?: number;
    points?: number;
    won?: number;
    draw?: number;
    loss?: number;
  }>;
}

interface StandingsPayload {
  tables?: StandingsTable[];
}

// ts team_id → our Team.id — league 별로 분리.
// 같은 tsId 가 UCL/UEL 등 컵대회 entry 와 정규 리그 entry 양쪽에 있으면 단일 Map 에서 충돌.
// (예: Real Madrid LALIGA ourId=1 + UCL ourId=506 같은 tsId → UCL 가 덮어쓰기 → LALIGA standings 매핑 실패)
const TS_TO_OUR_BY_LEAGUE = new Map<string, Map<string, number>>();
for (const e of teamIdMapping as TeamIdEntry[]) {
  if (!TS_TO_OUR_BY_LEAGUE.has(e.ourLeague)) {
    TS_TO_OUR_BY_LEAGUE.set(e.ourLeague, new Map());
  }
  TS_TO_OUR_BY_LEAGUE.get(e.ourLeague)!.set(e.tsId, e.ourId);
}

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CachedPositions {
  fetchedAt: number;
  positionByOurTeamId: Map<number, number>;
}
const cache = new Map<string, CachedPositions>();

/**
 * 리그 코드 (EPL/LALIGA/SERIE_A/...) 의 standings 에서 팀별 순위 추출.
 * 우선순위:
 *   1) TheSports standings — Lightsail standings-poller 1h 주기로 fresh
 *      (이전: api-football 우선이었으나 EPL Team.externalId 와 api-football
 *       teamExternalId 가 다른 source 라 95% 매칭 실패 + 잘못된 매칭 결과,
 *       2026-05-25 swap. /standings 페이지의 getFullStandings 와 동일 우선순위.)
 *   2) api-football fallback — TheSports 매핑 누락 팀 보강 (덮어쓰기 X)
 * 반환: Map<our Team.id, position(1-based)>. cache 없으면 null.
 */
export async function getStandingsPositions(
  league: string,
): Promise<Map<number, number> | null> {
  const now = Date.now();
  const hit = cache.get(league);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.positionByOurTeamId;
  }

  const positionByOurTeamId = new Map<number, number>();

  // 1) TheSports 우선 — ts team_id → ourId 변환
  const ts = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true },
  });
  if (ts) {
    const payload = ts.payload as unknown as StandingsPayload;
    const leagueMap = TS_TO_OUR_BY_LEAGUE.get(league);
    for (const t of payload?.tables ?? []) {
      for (const r of t.rows ?? []) {
        if (!r.team_id || r.position == null) continue;
        const ourId = leagueMap?.get(r.team_id);
        if (ourId != null) positionByOurTeamId.set(ourId, r.position);
      }
    }
  }

  // 2) api-football / api-baseball fallback — TheSports 누락 팀만 보강.
  // 야구 (CPBL/KBO/NPB/MLB/LMB) 는 TeamSourceId(api-baseball) 2차 lookup.
  // 전체 try-catch — 2026-05-27 production /predictions 500 사고 (DB row 가 어떤
  // path 에서 throw, local 정상). 한 league fail 해도 다른 league 정상 + 페이지 살림.
  try {
    const af = await prisma.apiFootballStandingsCache.findUnique({
      where: { league },
      select: { rows: true },
    });
    if (af) {
      const rows = (af.rows as unknown as Array<{
        teamExternalId: string;
        position: number;
      }>) ?? [];
      if (rows.length > 0) {
        const externalIds = rows.map((r) => r.teamExternalId);
        const isBaseball = ["KBO", "NPB", "MLB", "CPBL", "LMB"].includes(league);
        const teams = await prisma.team.findMany({
          where: { league, externalId: { in: externalIds } },
          select: { id: true, externalId: true },
        });
        const extToOurId = new Map<string, number>();
        for (const t of teams) extToOurId.set(t.externalId, t.id);
        if (isBaseball) {
          const sourceIds = await prisma.teamSourceId.findMany({
            where: { league, source: "api-baseball", externalId: { in: externalIds } },
            select: { teamId: true, externalId: true },
          });
          for (const s of sourceIds) if (!extToOurId.has(s.externalId)) extToOurId.set(s.externalId, s.teamId);
        }
        for (const r of rows) {
          const ourId = extToOurId.get(r.teamExternalId);
          if (ourId != null && !positionByOurTeamId.has(ourId)) {
            positionByOurTeamId.set(ourId, r.position);
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[standings-helper] af fallback fail league=${league}:`, (e as Error).message);
  }

  if (positionByOurTeamId.size === 0) return null;
  cache.set(league, { fetchedAt: now, positionByOurTeamId });
  return positionByOurTeamId;
}

export interface StandingsRow {
  teamId: number;
  position: number;
  points: number;
  won: number;
  draw: number;
  loss: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDiff?: number;
}

const fullCache = new Map<string, { fetchedAt: number; rows: StandingsRow[] }>();

/**
 * 리그의 full standings rows (순위/승점/승무패 등) 반환.
 * 우선 api-football → fallback TheSports.
 * 반환: position asc 정렬된 row 배열. cache 없으면 빈 배열.
 */
export async function getFullStandings(league: string): Promise<StandingsRow[]> {
  const now = Date.now();
  const hit = fullCache.get(league);
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) return hit.rows;

  const out: StandingsRow[] = [];
  const seen = new Set<number>();

  // 1) TheSports 우선 — Lightsail standings-poller 1시간 주기로 fresh.
  //    (이전: api-football 우선이었으나 1일 1회 cron 이라 19h+ stale 자주 발생,
  //     2026-05-25 사용자 EPL 순위 틀림 보고로 swap.)
  const ts = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true },
  });
  if (ts) {
    interface TsRow {
      team_id?: string;
      position?: number;
      points?: number;
      won?: number;
      draw?: number;
      loss?: number;
      goals?: [number, number] | { for?: number; against?: number };
      goal_diff?: number;
    }
    const payload = ts.payload as unknown as { tables?: Array<{ rows?: TsRow[] }> };
    const leagueMap = TS_TO_OUR_BY_LEAGUE.get(league);
    for (const t of payload?.tables ?? []) {
      for (const r of t.rows ?? []) {
        if (!r.team_id || r.position == null) continue;
        const ourId = leagueMap?.get(r.team_id);
        if (ourId == null || seen.has(ourId)) continue;
        seen.add(ourId);
        const gf = Array.isArray(r.goals) ? r.goals[0] : r.goals?.for;
        const ga = Array.isArray(r.goals) ? r.goals[1] : r.goals?.against;
        out.push({
          teamId: ourId,
          position: r.position,
          points: r.points ?? 0,
          won: r.won ?? 0,
          draw: r.draw ?? 0,
          loss: r.loss ?? 0,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDiff: r.goal_diff,
        });
      }
    }
  }

  // 2) api-football / api-baseball fallback — TheSports 매핑 누락 리그/팀 보강.
  // 전체 try-catch — 2026-05-27 production 500 사고. 야구는 TeamSourceId 2차 lookup.
  if (out.length === 0) {
    try {
      const af = await prisma.apiFootballStandingsCache.findUnique({
        where: { league },
        select: { rows: true },
      });
      if (af) {
        interface AfRow {
          teamExternalId: string;
          position: number;
          // 축구=number, 야구=object (TheSports payload). number 만 통과.
          points: number | { for?: number; against?: number };
          won: number;
          draw?: number;
          loss: number;
        }
        const rows = (af.rows as unknown as AfRow[]) ?? [];
        if (rows.length > 0) {
          const externalIds = rows.map((r) => r.teamExternalId);
          const isBaseball = ["KBO", "NPB", "MLB", "CPBL", "LMB"].includes(league);
          const teams = await prisma.team.findMany({
            where: { league, externalId: { in: externalIds } },
            select: { id: true, externalId: true },
          });
          const extToOurId = new Map<string, number>();
          for (const t of teams) extToOurId.set(t.externalId, t.id);
          if (isBaseball) {
            const sourceIds = await prisma.teamSourceId.findMany({
              where: { league, source: "api-baseball", externalId: { in: externalIds } },
              select: { teamId: true, externalId: true },
            });
            for (const s of sourceIds) if (!extToOurId.has(s.externalId)) extToOurId.set(s.externalId, s.teamId);
          }
          for (const r of rows) {
            const ourId = extToOurId.get(r.teamExternalId);
            if (ourId != null && !seen.has(ourId)) {
              seen.add(ourId);
              out.push({
                teamId: ourId,
                position: r.position,
                points: typeof r.points === "number" ? r.points : (r.won ?? 0),
                won: r.won ?? 0,
                draw: r.draw ?? 0,
                loss: r.loss ?? 0,
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[standings-helper] getFullStandings af fallback fail league=${league}:`, (e as Error).message);
    }
  }

  out.sort((a, b) => a.position - b.position);
  fullCache.set(league, { fetchedAt: now, rows: out });
  return out;
}

/**
 * 여러 리그의 standings 를 병렬 prefetch.
 * /scores 페이지처럼 한 화면에 여러 리그 매치가 섞여 있을 때 사용.
 *
 * 반환: Map<league, Map<our Team.id, position>>. cache 없는 리그는 빈 Map.
 */
export async function getStandingsForLeagues(
  leagues: string[],
): Promise<Map<string, Map<number, number>>> {
  const unique = Array.from(new Set(leagues));
  const out = new Map<string, Map<number, number>>();
  const results = await Promise.all(
    unique.map(async (lg) => ({ lg, pos: await getStandingsPositions(lg) })),
  );
  for (const { lg, pos } of results) {
    out.set(lg, pos ?? new Map());
  }
  return out;
}
