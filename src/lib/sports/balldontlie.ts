// BALLDONTLIE 통합 injuries fetch — NBA / NHL / MLB.
// 각 종목별 응답 구조가 약간 달라 정규화 거쳐 EspnInjuryEntry 호환 형식으로 반환.

import { unstable_cache } from "next/cache";
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

// BDL plan rate limit 이 분당 5(x-ratelimit-limit:5)로 매우 낮음 — 429 시 backoff 재시도로 흡수.
// 페이지가 force-dynamic 이라 fetch 의 next.revalidate 가 무시됨 → profile 은 unstable_cache 로 캐시.
const bdlSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function bdlGet(url: string, key: string): Promise<Response | null> {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { Authorization: key }, cache: "no-store" });
    if (r.status !== 429) return r;
    if (i < 2) await bdlSleep(1500 * (i + 1)); // 429 → 1.5s · 3s 후 재시도
  }
  return null;
}

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

// force-dynamic 페이지라 fetch 캐시가 무시됨 → unstable_cache 로 강제 캐시(1시간). BDL 분당 5
//  한도에서 같은 선수 호출을 사용자·재방문 간 공유하는 핵심. 429 지속(bdlGet null)·5xx 는 throw 로
//  캐시를 회피해 다음 요청에 재시도(404·정상 무데이터만 null 로 캐시).
const getNbaPlayerCached = unstable_cache(
  async (id: number): Promise<NbaPlayerProfile | null> => {
    const key = process.env.BALLDONTLIE_KEY ?? "";
    const r = await bdlGet(`${BDL_NBA}/players/${id}`, key);
    if (!r) throw new Error("bdl 429");
    if (!r.ok) {
      if (r.status === 404) return null;
      throw new Error(`bdl ${r.status}`);
    }
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
        ? { id: d.team.id, fullName: d.team.full_name, city: d.team.city, name: d.team.name, abbr: d.team.abbreviation }
        : undefined,
    };
  },
  ["bdl-nba-player"],
  { revalidate: 3600 },
);

export async function fetchNbaPlayer(id: number): Promise<NbaPlayerProfile | null> {
  if (!process.env.BALLDONTLIE_KEY) return null;
  try {
    return await getNbaPlayerCached(id);
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
    const r = await bdlGet(`${BDL_NBA}/season_averages?player_id=${playerId}&season=${season}`, key);
    if (!r || !r.ok) return null;
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
    const r = await bdlGet(`${BDL_NBA}/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=${limit}`, key);
    if (!r || !r.ok) return [];
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

// ===== LCK 선수 페이지 (/players/[id]?league=LOL) =====

const BDL_LOL = "https://api.balldontlie.io/lol/v1";
const LCK_TID = 324;

export interface LolPlayerStats {
  playerId: number;
  nickname: string;
  team?: string;
  matches: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  csAvg: number;
  goldAvg: number;
  damageAvg: number;
  wardsAvg: number;
  killsAvg: number;
  deathsAvg: number;
  assistsAvg: number;
  /** 가장 자주 본 role */
  primaryRole?: string;
  /** 챔피언 pick 상위 5종 */
  topChampions: Array<{ name: string; picks: number; wins?: number }>;
}

export interface LolMatchRow {
  matchMapId: number;
  champion: string;
  role?: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  wards: number;
}

interface BdlLolStatRow {
  match_map_id: number;
  player: { id: number; nickname: string };
  team?: { id: number; name: string };
  champion?: { id: number; name: string };
  role?: string;
  kills: number;
  deaths: number;
  assists: number;
  creep_score: number;
  gold_earned: number;
  total_damage_dealt_to_champions: number;
  wards_placed: number;
}

/** LCK 시즌 (올해 매치 stats) — pagination. */
async function fetchAllLolStatsForPlayer(
  playerId: number,
  season: number,
): Promise<BdlLolStatRow[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  const dateFrom = `${season}-01-01`;
  const all: BdlLolStatRow[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 10; i++) {
    try {
      // BDL `/lol/v1/player_match_map_stats` 가 player_ids[] 필터를 무시함.
      // player_id (단수) 만 적용됨 — 단수 사용.
      const url = new URL(`${BDL_LOL}/player_match_map_stats`);
      url.searchParams.set("player_id", String(playerId));
      url.searchParams.set("tournament_ids[]", String(LCK_TID));
      url.searchParams.set("dates[]", dateFrom);
      url.searchParams.set("per_page", "100");
      if (cursor) url.searchParams.set("cursor", String(cursor));
      const r = await fetch(url.toString(), {
        headers: { Authorization: key },
        cache: "no-store",
      });
      if (!r.ok) break;
      const d = (await r.json()) as {
        data: BdlLolStatRow[];
        meta?: { next_cursor?: number };
      };
      all.push(...d.data);
      if (!d.meta?.next_cursor) break;
      cursor = d.meta.next_cursor;
    } catch {
      break;
    }
  }
  return all;
}

export async function fetchLolPlayerSeason(
  playerId: number,
  season: number,
): Promise<{ stats: LolPlayerStats | null; recent: LolMatchRow[] }> {
  const rows = await fetchAllLolStatsForPlayer(playerId, season);
  if (rows.length === 0) return { stats: null, recent: [] };
  const first = rows[0];
  // 챔피언 pick 집계
  const champCount = new Map<string, number>();
  // role 집계
  const roleCount = new Map<string, number>();
  // team 집계
  const teamCount = new Map<string, number>();
  let k = 0, d = 0, a = 0, cs = 0, gold = 0, dmg = 0, wards = 0;
  for (const s of rows) {
    k += s.kills ?? 0;
    d += s.deaths ?? 0;
    a += s.assists ?? 0;
    cs += s.creep_score ?? 0;
    gold += s.gold_earned ?? 0;
    dmg += s.total_damage_dealt_to_champions ?? 0;
    wards += s.wards_placed ?? 0;
    if (s.champion?.name) {
      champCount.set(s.champion.name, (champCount.get(s.champion.name) ?? 0) + 1);
    }
    if (s.role) {
      roleCount.set(s.role, (roleCount.get(s.role) ?? 0) + 1);
    }
    if (s.team?.name) {
      teamCount.set(s.team.name, (teamCount.get(s.team.name) ?? 0) + 1);
    }
  }
  const matches = rows.length;
  const kda = d === 0 ? k + a : (k + a) / d;
  const primaryRole = [...roleCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const team = [...teamCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const topChampions = [...champCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, picks]) => ({ name, picks }));

  // 최근 5경기 (match_map_id 큰 순)
  const recentSorted = [...rows].sort((a, b) => b.match_map_id - a.match_map_id).slice(0, 5);
  const recent: LolMatchRow[] = recentSorted.map((s) => ({
    matchMapId: s.match_map_id,
    champion: s.champion?.name ?? "?",
    role: s.role,
    kills: s.kills ?? 0,
    deaths: s.deaths ?? 0,
    assists: s.assists ?? 0,
    cs: s.creep_score ?? 0,
    gold: s.gold_earned ?? 0,
    damage: s.total_damage_dealt_to_champions ?? 0,
    wards: s.wards_placed ?? 0,
  }));

  return {
    stats: {
      playerId,
      nickname: first.player.nickname,
      team,
      matches,
      kills: k,
      deaths: d,
      assists: a,
      kda,
      csAvg: cs / matches,
      goldAvg: gold / matches,
      damageAvg: dmg / matches,
      wardsAvg: wards / matches,
      killsAvg: k / matches,
      deathsAvg: d / matches,
      assistsAvg: a / matches,
      primaryRole,
      topChampions,
    },
    recent,
  };
}
