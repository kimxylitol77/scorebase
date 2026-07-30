// API-Football `/fixtures/statistics` 기반 축구 라이브 stats.
// ESPN summary 보다 훨씬 풍부 — possession / 슛 / 코너 / xG / 카드 / 패스 정확도.
//
// 호출 흐름:
//   1) resolveFixtureId(league, dateKst, away, home) — 일자+리그로 fixtures 검색 → 팀명 매치 → fixture id
//   2) fetchSoccerLiveStats(fixtureId) — statistics 호출 후 한국어 라벨 매핑
// 캐시: fixtureId 5분, statistics 30초 (라이브 동안 1분 폴링이라 충분).

import axios from "axios";
import { teamsMatch } from "@/lib/sports/api-football-pro";
import type { MatchTeamStat } from "@/lib/sports/live-scores";

const BASE = "https://v3.football.api-sports.io";

// 우리 League 코드 → api-football league id.
// J1=98, AFC_CL Elite=17 (Two=18 미사용), 나머지는 api-football-pro 와 동일.
const AF_LEAGUE_ID: Record<string, number> = {
  EPL: 39,
  LALIGA: 140,
  BUNDESLIGA: 78,
  SERIE_A: 135,
  LIGUE_1: 61,
  MLS: 253,
  UCL: 2,
  WORLD_CUP: 1,
  J1_LEAGUE: 98,
  AFC_CL: 17,
};

function currentSeason(league: string, dateKst: string): number {
  const year = parseInt(dateKst.slice(0, 4));
  const month = parseInt(dateKst.slice(5, 7));
  // 유럽 캘린더 (Aug~May) — 7월 이전이면 전년도 시즌
  const european = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL"];
  if (european.includes(league)) return month >= 7 ? year : year - 1;
  if (league === "WORLD_CUP") return 2026;
  return year; // MLS, J1, AFC_CL — 달력 연도
}

function client() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  return axios.create({
    baseURL: BASE,
    timeout: 8_000,
    headers: { "x-apisports-key": key },
  });
}

// ───── fixture id 캐시 ─────
export interface FixtureInfo {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
}
interface FixtureCacheEntry {
  info: FixtureInfo | null;
  at: number;
}
const fixtureCache = new Map<string, FixtureCacheEntry>();
const FIXTURE_TTL_MS = 5 * 60_000;

function fixtureCacheKey(league: string, dateKst: string, away: string, home: string): string {
  return `${league}|${dateKst}|${away.toLowerCase()}|${home.toLowerCase()}`;
}

export async function resolveFixture(
  league: string,
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<FixtureInfo | null> {
  const leagueId = AF_LEAGUE_ID[league];
  if (!leagueId) return null;
  const key = fixtureCacheKey(league, dateKst, awayName, homeName);
  const cached = fixtureCache.get(key);
  if (cached && Date.now() - cached.at < FIXTURE_TTL_MS) return cached.info;

  const c = client();
  if (!c) return null;
  try {
    const season = currentSeason(league, dateKst);
    // KST 매치는 UTC 기준 전날일 수도 있으므로 ±1일 범위로 조회
    const prev = addDays(dateKst, -1);
    const next = addDays(dateKst, 1);
    const { data } = await c.get("/fixtures", {
      params: { league: leagueId, season, from: prev, to: next },
    });
    const list = (data?.response ?? []) as Array<{
      fixture: { id: number };
      teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    }>;
    const match = list.find(
      (f) =>
        teamsMatch(f.teams.home.name, homeName) && teamsMatch(f.teams.away.name, awayName),
    );
    const info: FixtureInfo | null = match
      ? {
          id: match.fixture.id,
          homeTeamId: match.teams.home.id,
          awayTeamId: match.teams.away.id,
        }
      : null;
    fixtureCache.set(key, { info, at: Date.now() });
    return info;
  } catch {
    fixtureCache.set(key, { info: null, at: Date.now() });
    return null;
  }
}

function addDays(dateKst: string, delta: number): string {
  const d = new Date(`${dateKst}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ───── statistics 캐시 ─────
interface StatsCacheEntry {
  payload: { homeStats: MatchTeamStat[]; awayStats: MatchTeamStat[] } | null;
  at: number;
}
const statsCache = new Map<number, StatsCacheEntry>();
const STATS_TTL_MS = 30_000;

// api-football statistic type → 한국어 라벨 + 정렬 우선순위 (낮을수록 먼저)
interface StatMeta {
  label: string;
  order: number;
}
const STAT_MAP: Record<string, StatMeta> = {
  "Ball Possession": { label: "점유율", order: 0 },
  "Total Shots": { label: "슛", order: 1 },
  "Shots on Goal": { label: "유효슛", order: 2 },
  "Shots insidebox": { label: "박스안 슛", order: 3 },
  "Corner Kicks": { label: "코너", order: 4 },
  "Offsides": { label: "오프사이드", order: 5 },
  "Fouls": { label: "파울", order: 6 },
  "Yellow Cards": { label: "옐로카드", order: 7 },
  "Red Cards": { label: "레드카드", order: 8 },
  "Goalkeeper Saves": { label: "GK 세이브", order: 9 },
  "Passes %": { label: "패스 정확도", order: 10 },
  "expected_goals": { label: "xG", order: 11 },
};

interface ApiStatRaw {
  type: string;
  value: number | string | null;
}
interface ApiTeamStatsRaw {
  team: { id: number; name: string };
  statistics: ApiStatRaw[];
}

function toMatchStat(type: string, value: number | string | null): MatchTeamStat | null {
  const meta = STAT_MAP[type];
  if (!meta) return null;
  if (value === null || value === undefined) return null;
  const valueStr = typeof value === "string" ? value : String(value);
  const raw = typeof value === "number" ? value : parseFloat(valueStr.replace("%", ""));
  return {
    label: meta.label,
    value: valueStr,
    raw: Number.isFinite(raw) ? raw : -Infinity,
  };
}

function sortStats(stats: MatchTeamStat[]): MatchTeamStat[] {
  return [...stats].sort((a, b) => {
    const oa = Object.values(STAT_MAP).find((m) => m.label === a.label)?.order ?? 99;
    const ob = Object.values(STAT_MAP).find((m) => m.label === b.label)?.order ?? 99;
    return oa - ob;
  });
}

async function fetchStatistics(
  info: FixtureInfo,
): Promise<{ homeStats: MatchTeamStat[]; awayStats: MatchTeamStat[] } | null> {
  const cached = statsCache.get(info.id);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.payload;
  const c = client();
  if (!c) return null;
  try {
    const { data } = await c.get("/fixtures/statistics", { params: { fixture: info.id } });
    const teams = (data?.response ?? []) as ApiTeamStatsRaw[];
    if (teams.length < 2) {
      statsCache.set(info.id, { payload: null, at: Date.now() });
      return null;
    }
    const homeTeam = teams.find((t) => t.team.id === info.homeTeamId) ?? teams[0];
    const awayTeam = teams.find((t) => t.team.id === info.awayTeamId) ?? teams[1];
    const homeStats = sortStats(
      homeTeam.statistics
        .map((s) => toMatchStat(s.type, s.value))
        .filter((s): s is MatchTeamStat => s !== null),
    );
    const awayStats = sortStats(
      awayTeam.statistics
        .map((s) => toMatchStat(s.type, s.value))
        .filter((s): s is MatchTeamStat => s !== null),
    );
    const payload = { homeStats, awayStats };
    statsCache.set(info.id, { payload, at: Date.now() });
    return payload;
  } catch {
    statsCache.set(info.id, { payload: null, at: Date.now() });
    return null;
  }
}

/**
 * 축구 라이브 매치 stats — api-football 우선, 없으면 null (ESPN fallback).
 */
export async function fetchSoccerLiveStats(
  league: string,
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<{ homeStats: MatchTeamStat[]; awayStats: MatchTeamStat[] } | null> {
  if (!awayName || !homeName) return null;
  const info = await resolveFixture(league, dateKst, awayName, homeName);
  if (!info) return null;
  return fetchStatistics(info);
}

/** 라이브 stats 지원 리그 — `/api/live/match` 분기용. */
export function isApiFootballStatsSupported(league: string): boolean {
  return league in AF_LEAGUE_ID;
}
