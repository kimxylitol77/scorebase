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

  const row = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true },
  });
  if (!row) return null;

  const payload = row.payload as unknown as StandingsPayload;
  const tables = payload?.tables ?? [];
  if (tables.length === 0) return null;

  // 첫 table — 가끔 group stage 컵 대회는 여러 group. 메인 리그는 1개.
  const positionByOurTeamId = new Map<number, number>();
  for (const t of tables) {
    for (const r of t.rows ?? []) {
      if (!r.team_id || r.position == null) continue;
      const ourId = TS_TO_OUR_TEAM_ID.get(r.team_id);
      if (ourId != null) positionByOurTeamId.set(ourId, r.position);
    }
  }

  cache.set(league, { fetchedAt: now, positionByOurTeamId });
  return positionByOurTeamId;
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
