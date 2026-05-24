// TheSports raw 매치 → scorebase NormalizedMatch.
// 팀명 한글화는 normalize 단계에서 안 함 (toKoreanTeamName 호출하는 곳에서 처리).

import type { League, NormalizedMatch } from "../types";
import type { TSMatch, TSTeamMeta, TSTournamentMeta } from "./types";
import { TS_BASEBALL_TOURNAMENT_ID, type TSBaseballLeague } from "./types";
import { mapBaseballStatus } from "./status-codes";

/** TheSports tournament id → 우리 League 코드 */
const TOURNAMENT_TO_LEAGUE: Record<string, League> = {
  [TS_BASEBALL_TOURNAMENT_ID.KBO]: "KBO",
  [TS_BASEBALL_TOURNAMENT_ID.NPB]: "NPB",
  [TS_BASEBALL_TOURNAMENT_ID.MLB]: "MLB",
};

/** 거꾸로 — 우리 League → TheSports tournament id */
export function tournamentIdForLeague(league: TSBaseballLeague): string {
  return TS_BASEBALL_TOURNAMENT_ID[league];
}

/** TheSports raw 매치 → NormalizedMatch. team_map 으로 팀명 채움. */
export function normalizeBaseballMatch(opts: {
  match: TSMatch;
  teamMap: Map<string, TSTeamMeta>;
  /** results_extra.unique_tournament 으로부터 빌드한 토너먼트 map (옵션) */
  tournamentMap?: Map<string, TSTournamentMeta>;
}): NormalizedMatch | null {
  const { match, teamMap } = opts;
  const league = TOURNAMENT_TO_LEAGUE[match.unique_tournament_id];
  if (!league) return null; // KBO/NPB/MLB 외 토너먼트는 skip

  const home = teamMap.get(match.home_team_id);
  const away = teamMap.get(match.away_team_id);
  if (!home || !away) return null;

  const ft = match.scores?.ft;
  const homeScore = ft ? parseIntSafe(ft[0]) : undefined;
  const awayScore = ft ? parseIntSafe(ft[1]) : undefined;

  return {
    league,
    externalId: match.id,
    homeTeam: {
      externalId: match.home_team_id,
      name: home.name,
      logoUrl: home.logo,
    },
    awayTeam: {
      externalId: match.away_team_id,
      name: away.name,
      logoUrl: away.logo,
    },
    homeScore,
    awayScore,
    status: mapBaseballStatus(match.status_id),
    startTime: new Date(match.match_time * 1000),
    raw: match,
  };
}

function parseIntSafe(s: string): number | undefined {
  if (s === "X" || s === "-" || s === "") return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** results_extra.team 배열 → id 인덱스 Map */
export function buildTeamMap(teams: TSTeamMeta[] | undefined): Map<string, TSTeamMeta> {
  const map = new Map<string, TSTeamMeta>();
  for (const t of teams ?? []) map.set(t.id, t);
  return map;
}

export function buildTournamentMap(
  tournaments: TSTournamentMeta[] | undefined,
): Map<string, TSTournamentMeta> {
  const map = new Map<string, TSTournamentMeta>();
  for (const t of tournaments ?? []) map.set(t.id, t);
  return map;
}
