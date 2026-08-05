// TheSports football venue lookup.
// venue-list.json: /v1/football/venue/list 16 페이지 (~16k venues) minimal subset.
// team-id-mapping.json 의 tsVenueId 와 join → 우리 Team.id 로 venue meta lookup.

import venueListRaw from "./venue-list.json";
import teamIdMappingRaw from "./team-id-mapping.json";

export interface VenueMeta {
  id: string;
  name: string;
  city?: string;
  country?: string;
  country_id?: string;
  capacity?: number;
}

const VENUE_BY_ID: Map<string, VenueMeta> = new Map(
  (venueListRaw as VenueMeta[]).map((v) => [v.id, v]),
);

interface TeamMappingEntry {
  ourId: number;
  ourName?: string;
  tsId: string;
  tsName?: string;
  tsKo?: string;
  tsVenueId?: string;
}

const TS_VENUE_BY_OUR_TEAM_ID: Map<number, string> = new Map(
  (teamIdMappingRaw as TeamMappingEntry[])
    .filter((t) => t.tsVenueId)
    .map((t) => [t.ourId, t.tsVenueId as string]),
);

/** 대소문자·발음기호·구두점 차이를 없앤 팀명 키. */
function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// 팀명 → venue id 폴백 색인.
// 같은 구단이 리그별로 다른 Team row 를 갖는 경우(UCL 예선 팀 등) id 매핑이 비어 있어도
// 다른 리그 row 에 붙은 구장을 찾아 쓴다. 같은 이름이 서로 다른 구장을 가리키면 모호하므로 버린다.
const TS_VENUE_BY_TEAM_NAME: Map<string, string | null> = (() => {
  const byName = new Map<string, string | null>();
  for (const t of teamIdMappingRaw as TeamMappingEntry[]) {
    if (!t.tsVenueId) continue;
    for (const raw of [t.ourName, t.tsName, t.tsKo]) {
      if (!raw) continue;
      const key = normalizeTeamName(raw);
      if (!key) continue;
      const prev = byName.get(key);
      if (prev === undefined) byName.set(key, t.tsVenueId);
      else if (prev !== t.tsVenueId) byName.set(key, null);
    }
  }
  return byName;
})();

/** ts venue id → venue meta. 없으면 null. */
export function getVenueByTsId(tsVenueId: string | null | undefined): VenueMeta | null {
  if (!tsVenueId) return null;
  return VENUE_BY_ID.get(tsVenueId) ?? null;
}

// 이름 폴백을 허용하는 리그 — 자국 리그 팀이 출전하는 대륙대회.
// 같은 구단이 자국 리그 row 와 대회 row 로 나뉘는 곳이라 폴백이 맞는 구장을 집는다.
// 자국 리그에는 적용하지 않는다. 나라가 달라도 이름이 같은 구단(잉글랜드 Arsenal 과
// 벨라루스 Arsenal 등)에 엉뚱한 구장을 붙이기 때문이다.
const NAME_FALLBACK_LEAGUES = new Set([
  "UCL",
  "UEL",
  "UECL",
  "AFC_CL",
  "AFC_CL_TWO",
  "COPA_LIB",
  "COPA_SUD",
  "CLUB_WORLD_CUP",
]);

/**
 * 우리 Team.id → venue meta (홈팀 기본 구장). 매핑 없으면 null.
 *
 * 대륙대회 경기에 한해, id 매핑이 없으면 팀명으로 한 번 더 찾는다. 같은 구단이 자국 리그와
 * 대회에서 서로 다른 Team row 를 갖는 탓에(UCL 예선 팀 등) id 는 안 걸려도 구장 데이터는
 * 이미 있는 경우가 많다. 같은 이름이 서로 다른 구장을 가리키면 모호하므로 쓰지 않는다.
 */
export function getVenueByOurTeamId(
  ourTeamId: number,
  teamName?: string | null,
  league?: string | null,
): VenueMeta | null {
  const tsVenueId = TS_VENUE_BY_OUR_TEAM_ID.get(ourTeamId);
  if (tsVenueId) return getVenueByTsId(tsVenueId);
  if (!teamName || !league || !NAME_FALLBACK_LEAGUES.has(league)) return null;
  return getVenueByTsId(TS_VENUE_BY_TEAM_NAME.get(normalizeTeamName(teamName)) ?? null);
}
