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
import { assignNlGroups, parseNlRound, type NlTier } from "@/lib/sports/nations-league";

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

  // 조가 아닌 부속 표(2026-27 네이션스리그 "Ranking of third-placed teams" 4행)는 뺀다 — 이미 조에 있는
  //  팀이 다시 나와 아래 "전부 붙을 때만" 검사가 54≠58 로 표 전체를 버렸다(2026-09-25 실측).
  const all = (cache.rows as unknown as CachedAfRow[]) ?? [];
  const raw = all.some((r) => /\bGroup\b/i.test(r.group ?? "")) ? all.filter((r) => /\bGroup\b/i.test(r.group ?? "")) : all;
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
  const out = league === "UEFA_NL" ? await splitNlTiers(league, rows) : rows;
  out.sort((a, b) => a.rawGroup.localeCompare(b.rawGroup) || a.position - b.position);
  return out;
}

/**
 * 네이션스리그 — 2026-27 부터 af 조 이름에 리그 글자가 빠져 리그 A~D 의 같은 번호 조가 한 덩어리로 온다
 * ("Group 1" 15팀). 이번 시즌 경기 라운드("League A - 1")로 팀 등급을 얻어 조를 가르고 조 안에서 다시 순위를
 * 매긴다(규칙은 nations-league.assignNlGroups). 라벨·원문은 옛 형식으로 맞춰 호출부가 그대로 읽게 한다.
 */
async function splitNlTiers(league: string, rows: AfGroupedRow[]): Promise<AfGroupedRow[]> {
  const matches = await prisma.match.findMany({
    where: { league, homeTeamId: { in: rows.map((r) => r.teamId) } },
    orderBy: { startTime: "asc" },
    select: { raw: true, homeTeamId: true, awayTeamId: true },
  });
  // 오름차순으로 덮어써 가장 최근 시즌 등급이 남는다(승강으로 등급이 바뀐다).
  const tierOfTeam = new Map<number, NlTier>();
  for (const m of matches) {
    const t = parseNlRound(m.raw)?.tier;
    if (!t) continue;
    tierOfTeam.set(m.homeTeamId, t);
    tierOfTeam.set(m.awayTeamId, t);
  }
  const split = assignNlGroups(rows, tierOfTeam);
  // 등급을 못 정한 팀이 있으면 조가 반쪽이 된다 — 표를 통째로 쓰지 않는다(위와 같은 원칙).
  if (split.length !== rows.length) return [];
  return split.map(({ tier, group, ...r }) => ({
    ...r,
    rawGroup: `UEFA Nations League, League ${tier}, Group ${group}`,
    group: `리그 ${tier} · ${group}조`,
  }));
}
