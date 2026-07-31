// 워커에 내려줄 "폴링할 시즌 목록" 조립 — 순수 함수 (DB·네트워크 없음).
//
// ACTIVE 레지스트리가 정본이고, 아직 레지스트리에 없는 리그는 저장소 JSON 으로 메운다.
// 레지스트리가 전 리그를 덮으면 static 항목은 자연히 0건이 된다 — 이행이 끝났다는 신호.

export interface SeasonListItem {
  league: string;
  tsSeasonId: string;
  providerLeagueId: string;
  seasonLabel: string;
  source: "registry" | "static";
}

export interface RegistrySeasonInput {
  league: string;
  providerSeasonId: string;
  providerLeagueId: string;
  seasonLabel: string;
}

export interface StaticSeasonInput {
  code: string;
  tsId: string;
  tsSeasonId?: string;
}

/**
 * @param registry ACTIVE CompetitionSeason(thesports)
 * @param statics  league-id-mapping.json 항목
 * @param isTarget 대상 리그인지 (축구만 등)
 */
export function mergeSeasonList(
  registry: RegistrySeasonInput[],
  statics: StaticSeasonInput[],
  isTarget: (league: string) => boolean = () => true,
): SeasonListItem[] {
  const out = new Map<string, SeasonListItem>();
  for (const r of registry) {
    if (!r.providerSeasonId || !isTarget(r.league)) continue;
    out.set(r.league, {
      league: r.league,
      tsSeasonId: r.providerSeasonId,
      providerLeagueId: r.providerLeagueId,
      seasonLabel: r.seasonLabel,
      source: "registry",
    });
  }
  for (const s of statics) {
    if (out.has(s.code) || !s.tsSeasonId || !isTarget(s.code)) continue;
    out.set(s.code, {
      league: s.code,
      tsSeasonId: s.tsSeasonId,
      providerLeagueId: s.tsId,
      seasonLabel: "",
      source: "static",
    });
  }
  return [...out.values()].sort((a, b) => a.league.localeCompare(b.league));
}
