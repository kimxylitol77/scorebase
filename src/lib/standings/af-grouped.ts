// api-football 조별 순위표를 우리 Team id 로 옮긴 행들 — 조별 대회 순위의 단일 출처.
//
// 리그 페이지 탭(getFullStandings)과 /standings/[league] 가 서로 다른 경로로 표를 그린다.
// 규칙을 양쪽에 각각 두면 한쪽만 고쳐져 화면이 갈라지므로 여기 한 곳에만 둔다.
//
// 팀 연결이 두 단계인 이유. 국가대표 Team row 는 대회 라벨이 아니라 INTL_FRIENDLY 에 산다
// (UEFA_NL 라벨 Team row 는 3개뿐이었고, 그래서 "3팀 0경기" 표가 나갔다). Team.externalId 로
// 먼저 찾고, 없으면 TeamSourceId(source="api-football") 로 넘어간다.

import { prisma } from "@/lib/db";
import { afGroupLabel } from "@/lib/sports/af-group-label";

export interface AfGroupedRow {
  teamId: number;
  position: number;
  points: number;
  won: number;
  draw: number;
  loss: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  /** 화면 라벨 — "리그 A · 1조" */
  group: string;
  /** af 원문 — 정렬 기준(라벨은 같은 문자열로 합쳐질 수 있다) */
  rawGroup: string;
}

interface CachedAfRow {
  teamExternalId: string;
  position: number;
  points: number;
  won?: number;
  draw?: number;
  loss?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  group?: string;
}

/**
 * 조별 af 순위 행. 쓸 수 없으면 빈 배열 — 호출부는 기존 경로로 넘어가면 된다.
 * @param seasonOk 시즌 게이트(지난 시즌 캐시 차단). 주지 않으면 통과.
 */
export async function getAfGroupedRows(
  league: string,
  seasonOk?: (season: number) => boolean,
): Promise<AfGroupedRow[]> {
  const cache = await prisma.apiFootballStandingsCache.findUnique({
    where: { league },
    select: { rows: true, season: true },
  });
  if (!cache) return [];
  if (seasonOk && !seasonOk(cache.season)) return [];

  const raw = (cache.rows as unknown as CachedAfRow[]) ?? [];
  if (raw.length === 0) return [];
  // 조가 2개 이상일 때만 — 단일 표는 기존 ts·자체계산 경로가 담당한다.
  const groups = new Set(raw.map((r) => r.group).filter(Boolean));
  if (groups.size < 2) return [];

  const extIds = raw.map((r) => r.teamExternalId);
  const [byLeague, bySource] = await Promise.all([
    prisma.team.findMany({
      where: { league, externalId: { in: extIds } },
      select: { id: true, externalId: true },
    }),
    prisma.teamSourceId.findMany({
      where: { league, source: "api-football", externalId: { in: extIds } },
      select: { teamId: true, externalId: true },
    }),
  ]);
  const extToId = new Map<string, number>();
  for (const s of bySource) extToId.set(s.externalId, s.teamId);
  for (const t of byLeague) extToId.set(t.externalId, t.id); // 같은 라벨 Team row 가 우선

  const seen = new Set<number>();
  const rows: AfGroupedRow[] = [];
  for (const r of raw) {
    const teamId = extToId.get(r.teamExternalId);
    if (teamId == null || seen.has(teamId)) continue;
    seen.add(teamId);
    const gf = r.goalsFor ?? 0;
    const ga = r.goalsAgainst ?? 0;
    const rawGroup = r.group ?? "";
    rows.push({
      teamId,
      position: r.position,
      points: typeof r.points === "number" ? r.points : 0,
      won: r.won ?? 0,
      draw: r.draw ?? 0,
      loss: r.loss ?? 0,
      goalsFor: gf,
      goalsAgainst: ga,
      goalDiff: gf - ga,
      group: afGroupLabel(rawGroup),
      rawGroup,
    });
  }
  // 한 팀이라도 못 붙으면 그 조가 반쪽이 된다 — 전부 붙을 때만 쓴다.
  if (rows.length !== raw.length) return [];
  rows.sort((a, b) => a.rawGroup.localeCompare(b.rawGroup) || a.position - b.position);
  return rows;
}
