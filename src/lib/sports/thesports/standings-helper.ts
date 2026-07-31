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
import { PROVIDER_AF, PROVIDER_TS, getActiveSeason, resolveSeasonYear } from "../season-registry";
import {
  afCacheUsable,
  tsCacheUsable,
  isSeasonGated,
  hideStageStandings,
  standingsState,
  type StandingsState,
} from "./standings-gate";

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
 * 시즌 게이트 — 이 리그의 ACTIVE 시즌과 같은 시즌의 캐시만 쓰게 한다.
 * 레지스트리에 ACTIVE 가 없으면(도입 전 리그) 두 캐시 다 그대로 통과 = 기존 동작.
 *
 * 실패해도 화면을 죽이지 않는다 — 게이트 조회가 throw 하면 기존 동작으로 폴백한다.
 */
async function seasonGate(league: string): Promise<{
  tsOk: (cacheSeasonId: string | null) => boolean;
  afOk: (cacheSeason: number | null) => boolean;
}> {
  if (!isSeasonGated(league)) return { tsOk: () => true, afOk: () => true };
  try {
    const [activeTs, activeAf, seasonYear] = await Promise.all([
      getActiveSeason(league, PROVIDER_TS),
      getActiveSeason(league, PROVIDER_AF),
      resolveSeasonYear(league),
    ]);
    const activeSeasonId = activeTs?.providerSeasonId ?? null;
    // ACTIVE 레지스트리가 아예 없는 리그는 af 쪽도 기존 동작 유지 — 계산값만으로
    // 지금 화면에 나가는 캐시를 끊으면 도입 자체가 회귀가 된다.
    const hasRegistry = activeTs != null || activeAf != null;
    return {
      tsOk: (cacheSeasonId) => tsCacheUsable(league, activeSeasonId, cacheSeasonId).usable,
      afOk: (cacheSeason) =>
        hasRegistry ? afCacheUsable(league, seasonYear, cacheSeason).usable : true,
    };
  } catch (e) {
    console.warn(`[standings-helper] season gate 조회 실패 league=${league}:`, (e as Error).message);
    return { tsOk: () => true, afOk: () => true };
  }
}

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

  // J1/J2 2026 그룹 포맷(East/West) — 매치 카드 칩의 단일 [순위] 는 그룹상대순위라
  // East-3·West-3 가 둘 다 [3] 으로 모호하고, 중복 Team row 합산으로 한 position 에 여러 팀이
  // 잡힌다. 풀표(/predictions)는 그룹별로 정상 표시되므로 카드 칩은 숨긴다(UCL 녹아웃 가드와 동일).
  if (GROUPED_STANDINGS_LEAGUES.has(league)) {
    cache.set(league, { fetchedAt: now, positionByOurTeamId });
    return null;
  }

  const gate = await seasonGate(league);

  // 1) TheSports 우선 — ts team_id → ourId 변환
  const tsRow = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true, tsSeasonId: true },
  });
  // 이전 시즌 캐시는 새 시즌 경기에 붙이지 않는다 (개막 전이면 "순위 없음"이 정답).
  const ts = tsRow && gate.tsOk(tsRow.tsSeasonId) ? tsRow : null;
  if (ts) {
    const payload = ts.payload as unknown as StandingsPayload;
    // 녹아웃 가드 — UCL/UEL/UECL 은 리그페이즈(스위스 8경기) 완료 후 토너먼트 단계.
    // 녹아웃 매치(16강~결승)에 리그페이즈 순위([11] 등) 표기는 무의미·혼란이라 숨김.
    // 리그페이즈 진행 중(최다 소화 경기 < 8)엔 순위 표기 유지. (2026-05-29 UCL 결승 PSG[11])
    // 판정은 standings-gate.hideStageStandings 로 옮겨 단위 테스트가 가능하게 했다.
    if (hideStageStandings(league, (payload?.tables ?? []).flatMap((t) => t.rows ?? []))) {
      cache.set(league, { fetchedAt: now, positionByOurTeamId });
      return null;
    }
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
    const afRow = await prisma.apiFootballStandingsCache.findUnique({
      where: { league },
      select: { rows: true, season: true },
    });
    // 서로 다른 시즌의 두 순위표를 섞지 않는다 — 시즌 안 맞는 af 캐시는 병합하지 않는다.
    const af = afRow && gate.afOk(afRow.season) ? afRow : null;
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
  /** 그룹/지역명 (J1/J2 2026 100년 비전 = East/West 등). 일반 단일표 리그는 undefined. */
  group?: string | null;
}

// 2026 J리그 "100년 비전 리그"(과도기 단일 시즌, 2/6~6/7) = 그룹 포맷.
// J1: East 10 / West 10, J2: East A·B / West A·B 4그룹. ts payload 는 stage_id 가 opaque 라
// 그룹 라벨을 못 주므로 af(깨끗한 group 필드 + 전팀 매핑) 를 우선 source 로 사용한다.
// 2026-27 정상 단일표 복귀 시 이 set 비우면 됨.
export const GROUPED_STANDINGS_LEAGUES = new Set(["J1_LEAGUE", "J2_LEAGUE"]);

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
  const gate = await seasonGate(league);

  // 0) J1/J2 2026 그룹 포맷 — af(깨끗한 group 필드 + 전팀 매핑) 우선. ts 는 stage_id 가
  //    opaque 라 East/West 라벨 불가 + flatten 시 1~N위 중복. af 로 그룹별 표 구성.
  if (GROUPED_STANDINGS_LEAGUES.has(league)) {
    try {
      const afGRow = await prisma.apiFootballStandingsCache.findUnique({
        where: { league },
        select: { rows: true, season: true },
      });
      const afG = afGRow && gate.afOk(afGRow.season) ? afGRow : null;
      const gr =
        (afG?.rows as unknown as Array<{
          teamExternalId: string;
          position: number;
          points: number;
          won?: number;
          draw?: number;
          loss?: number;
          group?: string;
        }>) ?? [];
      if (gr.length > 0) {
        const ext = gr.map((r) => r.teamExternalId);
        const teamsG = await prisma.team.findMany({
          where: { league, externalId: { in: ext } },
          select: { id: true, externalId: true },
        });
        const e2o = new Map(teamsG.map((t) => [t.externalId, t.id]));
        for (const r of gr) {
          const ourId = e2o.get(r.teamExternalId);
          if (ourId == null || seen.has(ourId)) continue;
          seen.add(ourId);
          out.push({
            teamId: ourId,
            position: r.position,
            points: typeof r.points === "number" ? r.points : 0,
            won: r.won ?? 0,
            draw: r.draw ?? 0,
            loss: r.loss ?? 0,
            group: r.group ?? null,
          });
        }
        if (out.length > 0) {
          out.sort(
            (a, b) =>
              (a.group ?? "").localeCompare(b.group ?? "") ||
              a.position - b.position,
          );
          fullCache.set(league, { fetchedAt: now, rows: out });
          return out;
        }
      }
      // af 비면 아래 일반(ts) 경로로 fallback (그룹 라벨은 없지만 표시는 됨)
    } catch (e) {
      console.warn(
        `[standings-helper] grouped af fail league=${league}:`,
        (e as Error).message,
      );
    }
  }

  // 1) TheSports 우선 — Lightsail standings-poller 1시간 주기로 fresh.
  //    (이전: api-football 우선이었으나 1일 1회 cron 이라 19h+ stale 자주 발생,
  //     2026-05-25 사용자 EPL 순위 틀림 보고로 swap.)
  const tsRowFull = await prisma.theSportsStandingsCache.findUnique({
    where: { league },
    select: { payload: true, tsSeasonId: true },
  });
  // 시즌 게이트 — ACTIVE 시즌과 다른 시즌 캐시면 표를 만들지 않는다(작년 순위 노출 차단).
  const ts = tsRowFull && gate.tsOk(tsRowFull.tsSeasonId) ? tsRowFull : null;
  let tsTableCount = 0; // ts payload 의 table(=stage) 수. 2+ 면 다단계(J1/J2) — af 병합 제외용.
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
    tsTableCount = (payload?.tables ?? []).length;
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

  // 2) api-football / api-baseball fallback — TheSports 매핑 누락 "팀" 보강.
  // 이전엔 out.length===0(ts 완전 무매핑)일 때만 af 실행 → SERIE_B 처럼 ts 가 6/20 만
  // 매핑하면 af 가 차단돼 순위표에 14팀 누락(깨진 표). → 단일 table 리그는 af 로 병합 보강.
  // ⚠ 다단계(J1/J2 처럼 tables 2+ = stage 별 1~N위 중복) 리그는 flatten 자체가 별도 버그라
  // af 병합 시 중복만 늘어 제외(out 비었을 때만). getStandingsPositions 는 칩이라 영향 적어 항상 병합.
  if (out.length === 0 || tsTableCount <= 1) {
    try {
      const afRowFull = await prisma.apiFootballStandingsCache.findUnique({
        where: { league },
        select: { rows: true, season: true },
      });
      // 서로 다른 시즌의 두 표를 병합하지 않는다.
      const af = afRowFull && gate.afOk(afRowFull.season) ? afRowFull : null;
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
          // ts 가 이미 차지한 순위에는 af 팀을 넣지 않음 — af 가 stale(최대 5일) 이라 ts 와
          // 순위가 어긋나면 같은 position 에 두 팀이 생겨 표가 깨짐(BRASILEIRAO 7위 중복 사고). 충돌 시 skip.
          const tsPositions = new Set(out.map((r) => r.position));
          for (const r of rows) {
            const ourId = extToOurId.get(r.teamExternalId);
            if (ourId != null && !seen.has(ourId) && !tsPositions.has(r.position)) {
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
 * 순위표가 비었을 때 "개막 전"과 "순위 소스 없음"을 구분한다.
 * 개막 전이면 지난 시즌 표를 대신 보여주지 말고 이 상태를 그대로 노출하면 된다.
 */
export async function getStandingsState(league: string): Promise<{
  state: StandingsState;
  rows: StandingsRow[];
  firstFixtureAt: Date | null;
}> {
  const rows = await getFullStandings(league).catch(() => [] as StandingsRow[]);
  // 다음 경기 조회는 표가 비었을 때만 — "개막 전"과 "소스 없음"을 가를 때만 필요한 정보다.
  // 무조건 조회하면 순위가 정상인 페이지마다 쿼리가 하나씩 늘어 빌드 프리렌더에서
  // 커넥션 풀을 압박한다 (2026-07-31 배포 실패의 두 번째 요인).
  let firstFixtureAt: Date | null = null;
  if (rows.length === 0) {
    const next = await prisma.match
      .findFirst({
        where: { league, status: "SCHEDULED", startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        select: { startTime: true },
      })
      .catch(() => null);
    firstFixtureAt = next?.startTime ?? null;
  }
  return {
    state: standingsState(league, rows.length > 0, firstFixtureAt),
    rows,
    firstFixtureAt,
  };
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
