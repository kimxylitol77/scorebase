// BALLDONTLIE 통합 injuries fetch — NBA / NHL / MLB.
// 각 종목별 응답 구조가 약간 달라 정규화 거쳐 EspnInjuryEntry 호환 형식으로 반환.

import type { EspnInjuryEntry } from "./espn-injuries";

export interface BdlInjuryEntry extends EspnInjuryEntry {
  description?: string;
  returnDate?: string;
}

const BASE = "https://api.balldontlie.io";

async function call(
  url: string,
  key: string,
): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: key },
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    console.warn(`[bdl] ${url} HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

// ===== NBA =====
let nbaTeamCache: Map<number, string> | null = null;
let nbaTeamCacheAt = 0;
const TEAM_CACHE_TTL = 24 * 3600 * 1000;

interface BdlTeam {
  id: number;
  full_name?: string;
  name?: string;
}

async function getNbaTeamMap(key: string): Promise<Map<number, string>> {
  if (nbaTeamCache && Date.now() - nbaTeamCacheAt < TEAM_CACHE_TTL)
    return nbaTeamCache;
  const json = (await call(
    `${BASE}/v1/teams?per_page=100`,
    key,
  )) as { data?: BdlTeam[] } | null;
  const map = new Map<number, string>();
  for (const t of json?.data ?? []) {
    map.set(t.id, t.full_name ?? t.name ?? "");
  }
  nbaTeamCache = map;
  nbaTeamCacheAt = Date.now();
  return map;
}

interface BdlNbaInjuryRaw {
  player: { id: number; first_name: string; last_name: string; team_id?: number };
  return_date?: string;
  description?: string;
  status?: string;
}

async function fetchNba(key: string): Promise<BdlInjuryEntry[]> {
  const teamMap = await getNbaTeamMap(key);
  const out: BdlInjuryEntry[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 10; page++) {
    const u = new URL(`${BASE}/v1/player_injuries`);
    u.searchParams.set("per_page", "100");
    if (cursor) u.searchParams.set("cursor", String(cursor));
    const json = (await call(u.toString(), key)) as
      | { data?: BdlNbaInjuryRaw[]; meta?: { next_cursor?: number } }
      | null;
    if (!json?.data?.length) break;
    for (const it of json.data) {
      out.push({
        playerId: it.player.id,
        playerName: `${it.player.first_name} ${it.player.last_name}`.trim(),
        reason: it.status ?? "Injured",
        status: it.status ?? "Injured",
        teamName: teamMap.get(it.player.team_id ?? 0) ?? "",
        description: it.description,
        returnDate: it.return_date,
      });
    }
    cursor = json.meta?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

// ===== NHL =====
interface BdlNhlInjuryRaw {
  player: {
    id: number;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    teams?: Array<{ full_name?: string }>;
  };
  status?: string;
  injury_type?: string;
  return_date?: string;
  comment?: string;
}

async function fetchNhl(key: string): Promise<BdlInjuryEntry[]> {
  const out: BdlInjuryEntry[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 10; page++) {
    const u = new URL(`${BASE}/nhl/v1/player_injuries`);
    u.searchParams.set("per_page", "100");
    if (cursor) u.searchParams.set("cursor", String(cursor));
    const json = (await call(u.toString(), key)) as
      | { data?: BdlNhlInjuryRaw[]; meta?: { next_cursor?: number } }
      | null;
    if (!json?.data?.length) break;
    for (const it of json.data) {
      const name =
        it.player.full_name ??
        `${it.player.first_name ?? ""} ${it.player.last_name ?? ""}`.trim();
      const teamName = it.player.teams?.[0]?.full_name ?? "";
      const reason = it.injury_type && it.injury_type !== "Undisclosed"
        ? it.injury_type
        : (it.status ?? "Injured");
      out.push({
        playerId: it.player.id,
        playerName: name,
        reason,
        status: it.status ?? "Injured",
        teamName,
        description: it.comment,
        returnDate: it.return_date,
      });
    }
    cursor = json.meta?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

// ===== MLB =====
interface BdlMlbInjuryRaw {
  player: {
    id: number;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    team?: { display_name?: string };
  };
  status?: string;
  type?: string;
  detail?: string;
  side?: string;
  date?: string;
  return_date?: string;
  long_comment?: string;
  short_comment?: string;
}

async function fetchMlb(key: string): Promise<BdlInjuryEntry[]> {
  const out: BdlInjuryEntry[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 10; page++) {
    const u = new URL(`${BASE}/mlb/v1/player_injuries`);
    u.searchParams.set("per_page", "100");
    if (cursor) u.searchParams.set("cursor", String(cursor));
    const json = (await call(u.toString(), key)) as
      | { data?: BdlMlbInjuryRaw[]; meta?: { next_cursor?: number } }
      | null;
    if (!json?.data?.length) break;
    for (const it of json.data) {
      const name =
        it.player.full_name ??
        `${it.player.first_name ?? ""} ${it.player.last_name ?? ""}`.trim();
      const teamName = it.player.team?.display_name ?? "";
      const reasonParts = [it.side, it.type, it.detail].filter(Boolean);
      const reason = reasonParts.length > 0
        ? reasonParts.join(" ")
        : (it.status ?? "Injured");
      out.push({
        playerId: it.player.id,
        playerName: name,
        reason,
        status: it.status ?? "Injured",
        teamName,
        description: it.long_comment ?? it.short_comment,
        returnDate: it.return_date,
      });
    }
    cursor = json.meta?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

// ===== 통합 진입점 =====
export async function fetchBalldontlieInjuries(
  league: "NBA" | "NHL" | "MLB",
): Promise<BdlInjuryEntry[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) {
    console.warn("[bdl] BALLDONTLIE_KEY 미설정");
    return [];
  }
  if (league === "NBA") return fetchNba(key);
  if (league === "NHL") return fetchNhl(key);
  if (league === "MLB") return fetchMlb(key);
  return [];
}
