// API-Sports NBA v2 — 풀 boxscore (plusMinus, fastBreakPoints, pointsInPaint,
// biggestLead, secondChancePoints 등 ESPN 미제공 fields 포함).
// 호출: x-apisports-key 같은 API_FOOTBALL_KEY (NBA Ultra 활성).
//
// 흐름:
//   1) resolveNbaGameId(dateKst, away, home) — /games?date=Y-M-D → 팀명 매치
//   2) fetchNbaTeamStats(gameId) — /games/statistics → home/away MatchTeamStat[]
// 캐시: gameId 5분, stats 30초 (1분 폴링)

import axios from "axios";
import { toKoreanPlayerName } from "@/lib/player-names";
import type { MatchTeamStat, BasketballPlayerBox } from "@/lib/sports/live-scores";

const BASE = "https://v2.nba.api-sports.io";

function client() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  return axios.create({
    baseURL: BASE,
    timeout: 8_000,
    headers: { "x-apisports-key": key },
  });
}

interface GameRaw {
  id: number;
  date?: { start: string };
  status?: { short: number; long: string };
  teams: {
    home: { id: number; name: string; nickname?: string; code?: string };
    visitors: { id: number; name: string; nickname?: string; code?: string };
  };
}

interface TeamStatsRaw {
  team: { id: number; name: string };
  statistics: Array<{
    points: number;
    fgm: number;
    fga: number;
    fgp: string;
    ftm: number;
    fta: number;
    ftp: string;
    tpm: number;
    tpa: number;
    tpp: string;
    offReb: number;
    defReb: number;
    totReb: number;
    assists: number;
    pFouls: number;
    steals: number;
    turnovers: number;
    blocks: number;
    plusMinus: string | null;
    fastBreakPoints: number | null;
    pointsInPaint: number | null;
    biggestLead: number | null;
    secondChancePoints: number | null;
    pointsOffTurnovers: number | null;
    longestRun: number | null;
  }>;
}

// /players/statistics?game={id} — 선수별 boxscore (양팀 합쳐 20~30 rows)
interface PlayerStatsRaw {
  player: { id: number; firstname: string; lastname: string };
  team: { id: number };
  points: number;
  pos: string | null;
  min: string; // "28:17" 또는 "28"
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  tpm: number;
  tpa: number;
  offReb: number;
  defReb: number;
  totReb: number;
  assists: number;
  pFouls: number;
  steals: number;
  turnovers: number;
  blocks: number;
}

/** PlayerStatsRaw → 공통 박스스코어 행. min 빈값/DNP 은 제외. */
function toPlayerBox(p: PlayerStatsRaw): BasketballPlayerBox {
  const fullName = `${p.player.firstname ?? ""} ${p.player.lastname ?? ""}`.trim();
  return {
    name: toKoreanPlayerName(fullName),
    pos: p.pos || null,
    min: p.min ?? "",
    points: p.points ?? 0,
    reb: p.totReb ?? 0,
    oreb: p.offReb ?? null,
    assists: p.assists ?? 0,
    steals: p.steals ?? null,
    blocks: p.blocks ?? null,
    fgm: p.fgm ?? 0,
    fga: p.fga ?? 0,
    tpm: p.tpm ?? 0,
    tpa: p.tpa ?? 0,
    ftm: p.ftm ?? 0,
    fta: p.fta ?? 0,
  };
}

/** 출전 선수만 (min 있는 행), 득점 내림차순 */
function sortPlayers(players: PlayerStatsRaw[]): BasketballPlayerBox[] {
  return players
    .filter((p) => p.min && p.min !== "0" && p.min !== "0:00")
    .map(toPlayerBox)
    .sort((a, b) => b.points - a.points);
}

// ───── gameId 캐시 ─────
interface GameCacheEntry {
  id: number | null;
  at: number;
}
const gameCache = new Map<string, GameCacheEntry>();
const GAME_TTL_MS = 5 * 60_000;

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function teamsMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

function gameCacheKey(dateKst: string, away: string, home: string): string {
  return `${dateKst}|${normName(away)}|${normName(home)}`;
}

async function resolveNbaGameId(
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<number | null> {
  const key = gameCacheKey(dateKst, awayName, homeName);
  const cached = gameCache.get(key);
  if (cached && Date.now() - cached.at < GAME_TTL_MS) return cached.id;
  const c = client();
  if (!c) return null;
  try {
    // KST 와 NBA UTC/ET 일자 차이 → ±1일 조회
    for (const d of [dateKst, addDays(dateKst, -1), addDays(dateKst, 1)]) {
      const { data } = await c.get("/games", { params: { date: d } });
      const list = (data?.response ?? []) as GameRaw[];
      const match = list.find(
        (g) =>
          teamsMatch(g.teams.home.name, homeName) &&
          teamsMatch(g.teams.visitors.name, awayName),
      );
      if (match) {
        gameCache.set(key, { id: match.id, at: Date.now() });
        return match.id;
      }
    }
    gameCache.set(key, { id: null, at: Date.now() });
    return null;
  } catch {
    gameCache.set(key, { id: null, at: Date.now() });
    return null;
  }
}

function addDays(dateKst: string, delta: number): string {
  const d = new Date(`${dateKst}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ───── stats 캐시 ─────
interface StatsCacheEntry {
  payload: {
    homeTeamId: number;
    awayTeamId: number;
    stats: Record<number, MatchTeamStat[]>;
    players: Record<number, BasketballPlayerBox[]>;
  } | null;
  at: number;
}
const statsCache = new Map<number, StatsCacheEntry>();
const STATS_TTL_MS = 30_000;

// NBA stat → 한국어 라벨 + 정렬 우선순위
interface StatMeta {
  label: string;
  order: number;
  format?: (v: number) => string;
}
const STAT_META: Record<string, StatMeta> = {
  points: { label: "득점", order: 0 },
  fgp: { label: "FG%", order: 1, format: (v) => `${v}%` },
  tpp: { label: "3P%", order: 2, format: (v) => `${v}%` },
  ftp: { label: "FT%", order: 3, format: (v) => `${v}%` },
  totReb: { label: "리바", order: 4 },
  offReb: { label: "공격 리바", order: 5 },
  assists: { label: "어시", order: 6 },
  steals: { label: "스틸", order: 7 },
  blocks: { label: "블락", order: 8 },
  turnovers: { label: "턴오버", order: 9 },
  // 라이브 전용 (api-nba 가 ESPN 미제공)
  pointsInPaint: { label: "페인트 득점", order: 10 },
  fastBreakPoints: { label: "속공 득점", order: 11 },
  secondChancePoints: { label: "세컨 찬스", order: 12 },
  pointsOffTurnovers: { label: "T/O 후 득점", order: 13 },
  biggestLead: { label: "최대 리드", order: 14 },
  plusMinus: { label: "+/-", order: 15 },
};

function toStat(key: string, value: number | string | null): MatchTeamStat | null {
  const meta = STAT_META[key];
  if (!meta) return null;
  if (value == null || value === "") return null;
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return null;
  const valueStr = meta.format ? meta.format(num) : String(num);
  return { label: meta.label, value: valueStr, raw: num };
}

function buildStatsList(s: TeamStatsRaw["statistics"][number]): MatchTeamStat[] {
  const entries: MatchTeamStat[] = [];
  for (const key of Object.keys(STAT_META)) {
    const v = (s as unknown as Record<string, number | string | null>)[key];
    const stat = toStat(key, v);
    if (stat) entries.push(stat);
  }
  entries.sort((a, b) => {
    const oa = STAT_META[Object.keys(STAT_META).find((k) => STAT_META[k].label === a.label)!]?.order ?? 99;
    const ob = STAT_META[Object.keys(STAT_META).find((k) => STAT_META[k].label === b.label)!]?.order ?? 99;
    return oa - ob;
  });
  return entries;
}

/**
 * NBA 라이브 팀 stats — api-nba 우선, 없으면 null (ESPN fallback).
 */
export async function fetchNbaLiveStats(
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<{
  homeStats: MatchTeamStat[];
  awayStats: MatchTeamStat[];
  homePlayers: BasketballPlayerBox[];
  awayPlayers: BasketballPlayerBox[];
} | null> {
  if (!awayName || !homeName) return null;
  const gameId = await resolveNbaGameId(dateKst, awayName, homeName);
  if (!gameId) return null;
  const cached = statsCache.get(gameId);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) {
    if (!cached.payload) return null;
    const { homeTeamId, awayTeamId, stats, players } = cached.payload;
    return {
      homeStats: stats[homeTeamId] ?? [],
      awayStats: stats[awayTeamId] ?? [],
      homePlayers: players[homeTeamId] ?? [],
      awayPlayers: players[awayTeamId] ?? [],
    };
  }
  const c = client();
  if (!c) return null;
  try {
    // /games 의 home/away id 도 같이 받아두기 — statistics 응답 매칭용
    const { data: gamesData } = await c.get("/games", {
      params: { id: gameId },
    });
    const game = (gamesData?.response ?? [])[0] as GameRaw | undefined;
    if (!game) {
      statsCache.set(gameId, { payload: null, at: Date.now() });
      return null;
    }
    const homeTeamId = game.teams.home.id;
    const awayTeamId = game.teams.visitors.id;

    const [statsRes, playersRes] = await Promise.all([
      c.get("/games/statistics", { params: { id: gameId } }),
      c.get("/players/statistics", { params: { game: gameId } }),
    ]);
    const teams = (statsRes.data?.response ?? []) as TeamStatsRaw[];
    if (teams.length < 2) {
      statsCache.set(gameId, { payload: null, at: Date.now() });
      return null;
    }
    const stats: Record<number, MatchTeamStat[]> = {};
    for (const t of teams) {
      const s = t.statistics?.[0];
      if (!s) continue;
      stats[t.team.id] = buildStatsList(s);
    }

    const rawPlayers = (playersRes.data?.response ?? []) as PlayerStatsRaw[];
    const players: Record<number, BasketballPlayerBox[]> = {
      [homeTeamId]: sortPlayers(rawPlayers.filter((p) => p.team.id === homeTeamId)),
      [awayTeamId]: sortPlayers(rawPlayers.filter((p) => p.team.id === awayTeamId)),
    };

    const payload = { homeTeamId, awayTeamId, stats, players };
    statsCache.set(gameId, { payload, at: Date.now() });
    return {
      homeStats: stats[homeTeamId] ?? [],
      awayStats: stats[awayTeamId] ?? [],
      homePlayers: players[homeTeamId] ?? [],
      awayPlayers: players[awayTeamId] ?? [],
    };
  } catch {
    statsCache.set(gameId, { payload: null, at: Date.now() });
    return null;
  }
}
