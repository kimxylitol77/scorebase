// BALLDONTLIE NBA injuries — ALL-STAR plan 기준.
// ESPN 보다 풍부한 description + return_date 제공.

import type { EspnInjuryEntry } from "./espn-injuries";

/** 페이지의 RawInjury 와 호환되도록 EspnInjuryEntry 확장 */
export interface BdlInjuryEntry extends EspnInjuryEntry {
  description?: string;
  returnDate?: string;
}

interface BdlPlayer {
  id: number;
  first_name: string;
  last_name: string;
  team_id?: number;
}

interface BdlInjuryRaw {
  player: BdlPlayer;
  return_date?: string;
  description?: string;
  status?: string;
}

interface BdlTeam {
  id: number;
  full_name?: string;
  name?: string;
  abbreviation?: string;
}

const BASE = "https://api.balldontlie.io/v1";

async function call(
  path: string,
  params: Record<string, string | number>,
  key: string,
): Promise<unknown> {
  const u = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const res = await fetch(u.toString(), {
    headers: { Authorization: key },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    console.warn(`[bdl-nba] ${path} HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

let teamCache: Map<number, string> | null = null;
let teamCacheAt = 0;
const TEAM_CACHE_TTL = 24 * 3600 * 1000;

async function getTeamMap(key: string): Promise<Map<number, string>> {
  if (teamCache && Date.now() - teamCacheAt < TEAM_CACHE_TTL) return teamCache;
  const json = (await call("/teams", { per_page: 100 }, key)) as
    | { data?: BdlTeam[] }
    | null;
  const map = new Map<number, string>();
  for (const t of json?.data ?? []) {
    map.set(t.id, t.full_name ?? t.name ?? "");
  }
  teamCache = map;
  teamCacheAt = Date.now();
  return map;
}

export async function fetchBalldontlieNbaInjuries(): Promise<BdlInjuryEntry[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) {
    console.warn("[bdl-nba] BALLDONTLIE_KEY 미설정");
    return [];
  }
  const teamMap = await getTeamMap(key);

  const out: BdlInjuryEntry[] = [];
  let cursor: number | undefined;
  let pages = 0;
  while (pages < 10) {
    const params: Record<string, string | number> = { per_page: 100 };
    if (cursor) params.cursor = cursor;
    const json = (await call("/player_injuries", params, key)) as
      | { data?: BdlInjuryRaw[]; meta?: { next_cursor?: number } }
      | null;
    if (!json?.data?.length) break;
    for (const it of json.data) {
      const teamName = teamMap.get(it.player.team_id ?? 0) ?? "";
      out.push({
        playerId: it.player.id,
        playerName: `${it.player.first_name} ${it.player.last_name}`.trim(),
        reason: it.status ?? "Injured",
        status: it.status ?? "Injured",
        teamName,
        fixtureDate: undefined,
        description: it.description,
        returnDate: it.return_date,
      });
    }
    cursor = json.meta?.next_cursor;
    if (!cursor) break;
    pages++;
  }
  return out;
}
