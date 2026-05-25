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
  tsId: string;
  tsVenueId?: string;
}

const TS_VENUE_BY_OUR_TEAM_ID: Map<number, string> = new Map(
  (teamIdMappingRaw as TeamMappingEntry[])
    .filter((t) => t.tsVenueId)
    .map((t) => [t.ourId, t.tsVenueId as string]),
);

/** ts venue id → venue meta. 없으면 null. */
export function getVenueByTsId(tsVenueId: string | null | undefined): VenueMeta | null {
  if (!tsVenueId) return null;
  return VENUE_BY_ID.get(tsVenueId) ?? null;
}

/** 우리 Team.id → venue meta (홈팀 기본 구장). 매핑 없으면 null. */
export function getVenueByOurTeamId(ourTeamId: number): VenueMeta | null {
  const tsVenueId = TS_VENUE_BY_OUR_TEAM_ID.get(ourTeamId);
  return getVenueByTsId(tsVenueId);
}
