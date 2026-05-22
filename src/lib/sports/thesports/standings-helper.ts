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

// ts team_id → our Team.id (모듈 로드 시 한 번 만 변환)
const TS_TO_OUR_TEAM_ID = new Map<string, number>(
  (teamIdMapping as TeamIdEntry[]).map((e) => [e.tsId, e.ourId]),
);

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CachedPositions {
  fetchedAt: number;
  positionByOurTeamId: Map<number, number>;
}
const cache = new Map<string, CachedPositions>();

/**
 * 리그 코드 (EPL/LALIGA/SERIE_A/...) 의 standings 에서 팀별 순위 추출.
 * 우선순위:
 *   1) api-football standings (DB ApiFootballStandingsCache) — 매핑 자동 (Team.externalId join)
 *   2) TheSports standings (TS team_id 매핑 dictionary 통과)
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

  // 1) api-football — 우선 (정확, 매핑 dictionary 불필요)
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
      const teams = await prisma.team.findMany({
        where: { league, externalId: { in: externalIds } },
        select: { id: true, externalId: true },
      });
      const extToOurId = new Map(teams.map((t) => [t.externalId, t.id]));
      for (const r of rows) {
        const ourId = extToOurId.get(r.teamExternalId);
        if (ourId != null) positionByOurTeamId.set(ourId, r.position);
      }
    }
  }

  // 2) TheSports fallback — api-football 누락 팀 보강 (덮어쓰기 X)
  const ts = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true },
  });
  if (ts) {
    const payload = ts.payload as unknown as StandingsPayload;
    for (const t of payload?.tables ?? []) {
      for (const r of t.rows ?? []) {
        if (!r.team_id || r.position == null) continue;
        const ourId = TS_TO_OUR_TEAM_ID.get(r.team_id);
        if (ourId != null && !positionByOurTeamId.has(ourId)) {
          positionByOurTeamId.set(ourId, r.position);
        }
      }
    }
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

  // 1) api-football
  const af = await prisma.apiFootballStandingsCache.findUnique({
    where: { league },
    select: { rows: true },
  });
  if (af) {
    interface AfRow {
      teamExternalId: string;
      position: number;
      points: number;
      won: number;
      draw: number;
      loss: number;
    }
    const rows = (af.rows as unknown as AfRow[]) ?? [];
    if (rows.length > 0) {
      const externalIds = rows.map((r) => r.teamExternalId);
      const teams = await prisma.team.findMany({
        where: { league, externalId: { in: externalIds } },
        select: { id: true, externalId: true },
      });
      const extToOurId = new Map(teams.map((t) => [t.externalId, t.id]));
      for (const r of rows) {
        const ourId = extToOurId.get(r.teamExternalId);
        if (ourId != null && !seen.has(ourId)) {
          seen.add(ourId);
          out.push({
            teamId: ourId,
            position: r.position,
            points: r.points,
            won: r.won,
            draw: r.draw,
            loss: r.loss,
          });
        }
      }
    }
  }

  // 2) TheSports fallback
  if (out.length === 0) {
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
      for (const t of payload?.tables ?? []) {
        for (const r of t.rows ?? []) {
          if (!r.team_id || r.position == null) continue;
          const ourId = TS_TO_OUR_TEAM_ID.get(r.team_id);
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
