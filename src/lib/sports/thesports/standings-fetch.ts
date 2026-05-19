// /standings/[league] 페이지에서 ts 시즌 순위표 사용.
//
// 1) league-id-mapping.json 에서 league code → tsSeasonId 조회
// 2) season/recent/table/detail?uuid={season_id} fetch
// 3) team-id-mapping.json 으로 ts_team_id → 우리 DB team.id 역매핑
// 4) 미매핑된 ts 팀 제거 (외국인 wildcard 등 가짜 row)
//
// IP whitelist: Vercel serverless 동적 IP 차단 → Lightsail worker 가 1시간마다
// /api/internal/thesports-standings POST 로 push 하는 방식이 production 안전.
// (이번 commit 은 server-side 호출 — production 가능 여부는 Vercel egress IP 확인 후 결정.)

import { readFileSync } from "fs";
import path from "path";
import { fetchFootballSeasonStandings } from "./client";
import type { TSFootballStandingsRow, TSFootballSeasonStandingsResponse } from "./football-types";

interface LeagueMap {
  code: string;
  tsId: string;
  tsSeasonId?: string;
}
interface TeamMap {
  ourId: number;
  tsId: string;
}

let cachedLeagueMap: Map<string, string> | null = null; // league_code → tsSeasonId
let cachedReverseTeamMap: Map<string, number> | null = null; // tsTeamId → ourId

function loadLeagueMap(): Map<string, string> {
  if (cachedLeagueMap) return cachedLeagueMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/league-id-mapping.json");
  const leagues: LeagueMap[] = JSON.parse(readFileSync(file, "utf-8"));
  cachedLeagueMap = new Map();
  for (const l of leagues) {
    if (l.tsSeasonId) cachedLeagueMap.set(l.code, l.tsSeasonId);
  }
  return cachedLeagueMap;
}

function loadReverseTeamMap(): Map<string, number> {
  if (cachedReverseTeamMap) return cachedReverseTeamMap;
  const file = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const teams: TeamMap[] = JSON.parse(readFileSync(file, "utf-8"));
  cachedReverseTeamMap = new Map();
  for (const t of teams) cachedReverseTeamMap.set(t.tsId, t.ourId);
  return cachedReverseTeamMap;
}

export interface MappedStandingsRow extends TSFootballStandingsRow {
  /** 우리 DB Team.id — 미매핑 시 null */
  ourTeamId: number | null;
}

export interface MappedStandings {
  promotions: TSFootballSeasonStandingsResponse["results"]["promotions"];
  tables: Array<{
    id: string;
    conference: string;
    group: number;
    stage_id: string;
    rows: MappedStandingsRow[];
  }>;
}

/**
 * league_code 의 ts 시즌 순위표 → 우리 team.id 매핑된 형태로 반환.
 * @returns null 이면 ts standing 없음 (tsSeasonId 미매핑 or fetch 실패) → caller 가 fallback (DB calc) 사용.
 */
export async function fetchStandingsForLeague(leagueCode: string): Promise<MappedStandings | null> {
  const seasonId = loadLeagueMap().get(leagueCode);
  if (!seasonId) return null;

  let resp: TSFootballSeasonStandingsResponse;
  try {
    resp = await fetchFootballSeasonStandings(seasonId);
  } catch (e) {
    console.warn(`[ts-standings] ${leagueCode} fetch fail: ${(e as Error).message}`);
    return null;
  }

  const reverseTeam = loadReverseTeamMap();
  const tables = (resp.results.tables ?? []).map((t) => ({
    id: t.id,
    conference: t.conference,
    group: t.group,
    stage_id: t.stage_id,
    rows: (t.rows ?? []).map((r) => ({
      ...r,
      ourTeamId: reverseTeam.get(r.team_id) ?? null,
    })),
  }));
  return {
    promotions: resp.results.promotions ?? [],
    tables,
  };
}
