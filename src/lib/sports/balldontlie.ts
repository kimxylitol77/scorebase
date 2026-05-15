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

// ===== NBA 선수 페이지 (/players/[id]?league=NBA) =====

const BDL_NBA = "https://api.balldontlie.io/nba/v1";

export interface NbaPlayerProfile {
  id: number;
  firstName: string;
  lastName: string;
  position?: string;
  height?: string;
  weight?: string;
  jerseyNumber?: string;
  college?: string;
  country?: string;
  draftYear?: number;
  draftRound?: number;
  draftNumber?: number;
  team?: { id: number; fullName: string; city: string; name: string; abbr: string };
}

export interface NbaSeasonAverages {
  season: number;
  gamesPlayed: number;
  min: string;
  pts: number;
  ast: number;
  reb: number;
  oreb: number;
  dreb: number;
  stl: number;
  blk: number;
  turnover: number;
  pf: number;
  fgm: number;
  fga: number;
  fgPct: number;
  fg3m: number;
  fg3a: number;
  fg3Pct: number;
  ftm: number;
  fta: number;
  ftPct: number;
}

export interface NbaGameStat {
  id: number;
  min: string;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnover: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  plusMinus?: number;
  game?: {
    id: number;
    date: string;
    homeTeam: { abbr: string; fullName: string };
    visitorTeam: { abbr: string; fullName: string };
    homeTeamScore: number;
    visitorTeamScore: number;
  };
}

interface BdlNbaPlayerResp {
  data?: {
    id: number;
    first_name: string;
    last_name: string;
    position?: string;
    height?: string;
    weight?: string;
    jersey_number?: string;
    college?: string;
    country?: string;
    draft_year?: number;
    draft_round?: number;
    draft_number?: number;
    team?: {
      id: number;
      full_name: string;
      city: string;
      name: string;
      abbreviation: string;
    };
  };
}

export async function fetchNbaPlayer(id: number): Promise<NbaPlayerProfile | null> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`${BDL_NBA}/players/${id}`, {
      headers: { Authorization: key },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as BdlNbaPlayerResp;
    const d = j.data;
    if (!d) return null;
    return {
      id: d.id,
      firstName: d.first_name,
      lastName: d.last_name,
      position: d.position,
      height: d.height,
      weight: d.weight,
      jerseyNumber: d.jersey_number,
      college: d.college,
      country: d.country,
      draftYear: d.draft_year,
      draftRound: d.draft_round,
      draftNumber: d.draft_number,
      team: d.team
        ? {
            id: d.team.id,
            fullName: d.team.full_name,
            city: d.team.city,
            name: d.team.name,
            abbr: d.team.abbreviation,
          }
        : undefined,
    };
  } catch (e) {
    console.warn("[bdl] nba player 실패:", (e as Error).message);
    return null;
  }
}

export async function fetchNbaSeasonAverages(
  playerId: number,
  season: number,
): Promise<NbaSeasonAverages | null> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `${BDL_NBA}/season_averages?player_id=${playerId}&season=${season}`,
      { headers: { Authorization: key }, cache: "no-store" },
    );
    if (!r.ok) return null;
    interface AvgRow {
      season: number;
      games_played: number;
      min: string;
      pts: number;
      ast: number;
      reb: number;
      oreb: number;
      dreb: number;
      stl: number;
      blk: number;
      turnover: number;
      pf: number;
      fgm: number;
      fga: number;
      fg_pct: number;
      fg3m: number;
      fg3a: number;
      fg3_pct: number;
      ftm: number;
      fta: number;
      ft_pct: number;
    }
    const j = (await r.json()) as { data?: AvgRow[] };
    const d = j.data?.[0];
    if (!d) return null;
    return {
      season: d.season,
      gamesPlayed: d.games_played,
      min: d.min,
      pts: d.pts,
      ast: d.ast,
      reb: d.reb,
      oreb: d.oreb,
      dreb: d.dreb,
      stl: d.stl,
      blk: d.blk,
      turnover: d.turnover,
      pf: d.pf,
      fgm: d.fgm,
      fga: d.fga,
      fgPct: d.fg_pct,
      fg3m: d.fg3m,
      fg3a: d.fg3a,
      fg3Pct: d.fg3_pct,
      ftm: d.ftm,
      fta: d.fta,
      ftPct: d.ft_pct,
    };
  } catch (e) {
    console.warn("[bdl] nba avg 실패:", (e as Error).message);
    return null;
  }
}

export async function fetchNbaPlayerRecentGames(
  playerId: number,
  season: number,
  limit = 10,
): Promise<NbaGameStat[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  try {
    const r = await fetch(
      `${BDL_NBA}/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=${limit}`,
      { headers: { Authorization: key }, cache: "no-store" },
    );
    if (!r.ok) return [];
    interface StatRow {
      id: number;
      min: string;
      pts: number;
      ast: number;
      reb: number;
      stl: number;
      blk: number;
      turnover: number;
      fgm: number;
      fga: number;
      fg3m: number;
      fg3a: number;
      ftm: number;
      fta: number;
      plus_minus?: number;
      game?: {
        id: number;
        date: string;
        home_team?: { abbreviation: string; full_name: string };
        visitor_team?: { abbreviation: string; full_name: string };
        home_team_score: number;
        visitor_team_score: number;
      };
    }
    const j = (await r.json()) as { data?: StatRow[] };
    const rows: NbaGameStat[] = (j.data ?? []).map((s) => ({
      id: s.id,
      min: s.min,
      pts: s.pts,
      ast: s.ast,
      reb: s.reb,
      stl: s.stl,
      blk: s.blk,
      turnover: s.turnover,
      fgm: s.fgm,
      fga: s.fga,
      fg3m: s.fg3m,
      fg3a: s.fg3a,
      ftm: s.ftm,
      fta: s.fta,
      plusMinus: s.plus_minus,
      game: s.game
        ? {
            id: s.game.id,
            date: s.game.date,
            homeTeam: {
              abbr: s.game.home_team?.abbreviation ?? "",
              fullName: s.game.home_team?.full_name ?? "",
            },
            visitorTeam: {
              abbr: s.game.visitor_team?.abbreviation ?? "",
              fullName: s.game.visitor_team?.full_name ?? "",
            },
            homeTeamScore: s.game.home_team_score,
            visitorTeamScore: s.game.visitor_team_score,
          }
        : undefined,
    }));
    // 최근 순
    rows.sort((a, b) => (b.game?.date ?? "").localeCompare(a.game?.date ?? ""));
    return rows;
  } catch (e) {
    console.warn("[bdl] nba games 실패:", (e as Error).message);
    return [];
  }
}
