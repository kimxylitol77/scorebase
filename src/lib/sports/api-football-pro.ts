// api-football Pro 전용 enrichment 데이터.
// - 시즌 부상자 (전체 한 번 호출 + 메모리 캐시)
// - 시즌 득점왕 (전체 한 번 호출 + 메모리 캐시)
//
// 호출 절약: 시즌·리그 단위 캐시. 만료 6시간.

import axios from "axios";

const BASE_URL = "https://v3.football.api-sports.io";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

// 우리 League 코드 → api-football league ID 매핑
export const API_FOOTBALL_LEAGUE_ID: Record<string, number> = {
  EPL: 39,
  LALIGA: 140,
  BUNDESLIGA: 78,
  SERIE_A: 135,
  LIGUE_1: 61,
  MLS: 253,
  UCL: 2,
};

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

const injuriesCache = new Map<string, CacheEntry<InjuryEntry[]>>();
const topScorersCache = new Map<string, CacheEntry<TopScorerEntry[]>>();

function client() {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) throw new Error("API_FOOTBALL_KEY 가 없습니다 (Pro 가입 필요).");
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { "x-apisports-key": k },
  });
}

// ===== 부상자 =====

export interface InjuryEntry {
  playerId: number;
  playerName: string;
  reason: string; // 부상 종류
  type: string; // "Missing Fixture" 등
  teamId: number;
  teamName: string;
  /** 매치 시점 (있을 때만) */
  fixtureDate?: string;
}

export async function fetchSeasonInjuries(
  league: string,
  season: number,
): Promise<InjuryEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];

  const key = `${league}:${season}`;
  const cached = injuriesCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data } = await client().get("/injuries", {
      params: { league: lid, season },
    });
    const arr: InjuryEntry[] = (data?.response ?? []).map((r: any) => ({
      playerId: r.player?.id,
      playerName: r.player?.name ?? "",
      reason: r.player?.reason ?? "",
      type: r.player?.type ?? "",
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      fixtureDate: r.fixture?.date ?? undefined,
    }));
    injuriesCache.set(key, { fetchedAt: Date.now(), data: arr });
    return arr;
  } catch (e) {
    console.warn(
      "[api-football-pro] fetchSeasonInjuries 실패:",
      (e as Error).message,
    );
    return [];
  }
}

/** 특정 팀의 최근 부상자 (이름 + 부상 유형) */
export function getTeamInjuries(
  all: InjuryEntry[],
  teamName: string,
  beforeIso?: string,
  limit = 8,
): InjuryEntry[] {
  // 우리 DB의 팀 이름과 api-football 팀 이름이 살짝 다를 수 있어 부분일치
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+fc$/, "").replace(/\s+/g, "");
  const target = norm(teamName);

  const filtered = all.filter((i) => {
    const t = norm(i.teamName);
    if (!t.includes(target) && !target.includes(t)) return false;
    if (beforeIso && i.fixtureDate && i.fixtureDate > beforeIso) return false;
    return true;
  });

  // 가장 최근 부상자만 (중복 선수는 가장 최근 항목만 유지)
  const byPlayer = new Map<number, InjuryEntry>();
  filtered.sort((a, b) =>
    (b.fixtureDate ?? "").localeCompare(a.fixtureDate ?? ""),
  );
  for (const i of filtered) {
    if (!byPlayer.has(i.playerId)) byPlayer.set(i.playerId, i);
    if (byPlayer.size >= limit) break;
  }
  return Array.from(byPlayer.values());
}

// ===== 시즌 득점왕 =====

export interface TopScorerEntry {
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string;
  goals: number;
  assists: number;
  appearances: number;
}

export async function fetchSeasonTopScorers(
  league: string,
  season: number,
): Promise<TopScorerEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];

  const key = `${league}:${season}`;
  const cached = topScorersCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data } = await client().get("/players/topscorers", {
      params: { league: lid, season },
    });
    const arr: TopScorerEntry[] = (data?.response ?? []).map((r: any) => {
      const stat = r.statistics?.[0] ?? {};
      return {
        playerId: r.player?.id,
        playerName: r.player?.name ?? "",
        teamId: stat.team?.id,
        teamName: stat.team?.name ?? "",
        goals: stat.goals?.total ?? 0,
        assists: stat.goals?.assists ?? 0,
        appearances: stat.games?.appearences ?? 0,
      };
    });
    topScorersCache.set(key, { fetchedAt: Date.now(), data: arr });
    return arr;
  } catch (e) {
    console.warn(
      "[api-football-pro] fetchSeasonTopScorers 실패:",
      (e as Error).message,
    );
    return [];
  }
}

/** 특정 팀의 시즌 득점 핵심 선수 Top N */
export function getTeamKeyPlayers(
  all: TopScorerEntry[],
  teamName: string,
  limit = 3,
): TopScorerEntry[] {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+fc$/, "").replace(/\s+/g, "");
  const target = norm(teamName);
  return all
    .filter((p) => {
      const t = norm(p.teamName);
      return t.includes(target) || target.includes(t);
    })
    .slice(0, limit);
}

// ===== 매치별 데이터 (라인업, 이벤트) — RECAP 용 =====

export interface FixtureEvent {
  minute: number;
  type: "Goal" | "Card" | "subst" | "Var" | string;
  detail: string; // "Normal Goal" / "Yellow Card" / 등
  teamId: number;
  teamName: string;
  playerName: string;
  assistName?: string;
}

export interface FixtureLineup {
  teamId: number;
  teamName: string;
  formation?: string;
  startXI: string[]; // 선수 이름 11명
  coach?: string;
}

interface FixtureMatchInfo {
  fixtureId: number;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
}

/** 우리 DB 매치를 api-football fixture ID 와 매칭 */
export async function findFixtureByDateAndTeams(
  league: string,
  date: Date,
  homeTeamName: string,
  awayTeamName: string,
): Promise<number | null> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return null;

  const season = getApiFootballSeason(date, league);
  const ymd = date.toISOString().slice(0, 10);

  try {
    const { data } = await client().get("/fixtures", {
      params: { league: lid, season, date: ymd },
    });
    const list: FixtureMatchInfo[] = (data?.response ?? []).map((r: any) => ({
      fixtureId: r.fixture.id,
      date: r.fixture.date,
      homeTeamName: r.teams.home.name,
      awayTeamName: r.teams.away.name,
    }));

    const norm = (s: string) =>
      s.toLowerCase().replace(/\s+fc$/, "").replace(/\s+/g, "");
    const h = norm(homeTeamName);
    const a = norm(awayTeamName);

    const found = list.find((m) => {
      const mh = norm(m.homeTeamName);
      const ma = norm(m.awayTeamName);
      return (
        (mh.includes(h) || h.includes(mh)) &&
        (ma.includes(a) || a.includes(ma))
      );
    });
    return found?.fixtureId ?? null;
  } catch {
    return null;
  }
}

export async function fetchFixtureLineups(
  fixtureId: number,
): Promise<FixtureLineup[]> {
  try {
    const { data } = await client().get("/fixtures/lineups", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => ({
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      formation: r.formation,
      startXI: (r.startXI ?? [])
        .map((p: any) => p.player?.name)
        .filter(Boolean),
      coach: r.coach?.name,
    }));
  } catch {
    return [];
  }
}

export async function fetchFixtureEvents(
  fixtureId: number,
): Promise<FixtureEvent[]> {
  try {
    const { data } = await client().get("/fixtures/events", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => ({
      minute: r.time?.elapsed ?? 0,
      type: r.type ?? "",
      detail: r.detail ?? "",
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      playerName: r.player?.name ?? "",
      assistName: r.assist?.name ?? undefined,
    }));
  } catch {
    return [];
  }
}

/** 시즌 시작 연도 — api-football 형식 */
export function getApiFootballSeason(date: Date, league: string): number {
  const m = date.getMonth();
  // EPL/유럽은 8월~5월 시즌
  if (
    [
      "EPL",
      "LALIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
      "UCL",
    ].includes(league)
  ) {
    return m >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  }
  // MLS 는 단일 연도
  return date.getFullYear();
}
