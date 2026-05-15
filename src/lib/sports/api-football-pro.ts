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
  WORLD_CUP: 1, // FIFA World Cup
};

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

const injuriesCache = new Map<string, CacheEntry<InjuryEntry[]>>();
const topScorersCache = new Map<string, CacheEntry<TopScorerEntry[]>>();

/**
 * api-football 팀명 매칭 — "Man City" ↔ "Manchester City",
 * "Brighton Hove" ↔ "Brighton & Hove Albion" 같은 차이 흡수.
 * 토큰화 후 의미 단어들의 부분집합 관계로 판단.
 */
export function teamsMatch(a: string, b: string): boolean {
  const STOP = new Set([
    "fc", "afc", "cf", "club", "the", "and", "&",
    "city", "united", "town", "rovers", "wanderers", "hotspur",
    "athletic", "albion", "rangers",
  ]);
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return false;
  // 길이 적은 쪽의 모든 토큰이 다른 쪽에 포함되면 매치
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shorter.every((t) => longer.some((u) => u.startsWith(t) || t.startsWith(u)));
}

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
  photoUrl?: string;
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
        photoUrl: r.player?.photo,
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

// ===== 시즌 리그 리더보드 (LeagueLeaderBoard 용) =====
// /players/topassists, /players/topyellowcards, /players/topredcards
// 응답 구조는 topscorers 와 동일 — statistics[0] 에 각 stat.

export interface PlayerLeaderEntry {
  playerId: number;
  playerName: string;
  photoUrl?: string;
  teamId: number;
  teamName: string;
  value: number; // goals · assists · yellow · red
  appearances: number;
}

async function fetchPlayersLeaderboard(
  endpoint: "/players/topscorers" | "/players/topassists" | "/players/topyellowcards" | "/players/topredcards",
  league: string,
  season: number,
  extract: (stat: Record<string, unknown>) => number,
): Promise<PlayerLeaderEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];
  try {
    const { data } = await client().get(endpoint, {
      params: { league: lid, season },
    });
    return (data?.response ?? []).map((r: Record<string, unknown>) => {
      const player = (r.player ?? {}) as Record<string, unknown>;
      const stat = ((r.statistics as unknown[])?.[0] ?? {}) as Record<string, unknown>;
      const team = (stat.team ?? {}) as Record<string, unknown>;
      const games = (stat.games ?? {}) as Record<string, unknown>;
      return {
        playerId: player.id as number,
        playerName: (player.name as string) ?? "",
        photoUrl: player.photo as string | undefined,
        teamId: team.id as number,
        teamName: (team.name as string) ?? "",
        value: extract(stat) ?? 0,
        appearances: (games.appearences as number) ?? 0,
      };
    });
  } catch (e) {
    console.warn(`[api-football-pro] ${endpoint} 실패:`, (e as Error).message);
    return [];
  }
}

export async function fetchTopAssists(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topassists",
    league,
    season,
    (s) => ((s.goals as Record<string, unknown>)?.assists as number) ?? 0,
  );
}

export async function fetchTopYellowCards(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topyellowcards",
    league,
    season,
    (s) => ((s.cards as Record<string, unknown>)?.yellow as number) ?? 0,
  );
}

export async function fetchTopRedCards(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topredcards",
    league,
    season,
    (s) => ((s.cards as Record<string, unknown>)?.red as number) ?? 0,
  );
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

    const found = list.find(
      (m) =>
        teamsMatch(m.homeTeamName, homeTeamName) &&
        teamsMatch(m.awayTeamName, awayTeamName),
    );
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

// ===== 매치 통계 (슛/패스/점유율) — RECAP 강화 =====

export interface FixtureStat {
  teamId: number;
  teamName: string;
  shotsOnGoal?: number;
  shotsTotal?: number;
  possessionPct?: number; // 0~100
  passesTotal?: number;
  passesAccuratePct?: number;
  fouls?: number;
  cornerKicks?: number;
  yellowCards?: number;
  redCards?: number;
  saves?: number;
}

const STAT_KEY: Record<string, keyof FixtureStat> = {
  "Shots on Goal": "shotsOnGoal",
  "Total Shots": "shotsTotal",
  "Ball Possession": "possessionPct",
  "Total passes": "passesTotal",
  "Passes accurate": "passesAccuratePct",
  Fouls: "fouls",
  "Corner Kicks": "cornerKicks",
  "Yellow Cards": "yellowCards",
  "Red Cards": "redCards",
  "Goalkeeper Saves": "saves",
};

export async function fetchFixtureStatistics(
  fixtureId: number,
): Promise<FixtureStat[]> {
  try {
    const { data } = await client().get("/fixtures/statistics", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => {
      const out: FixtureStat = {
        teamId: r.team?.id,
        teamName: r.team?.name ?? "",
      };
      for (const s of r.statistics ?? []) {
        const key = STAT_KEY[s.type as string];
        if (!key) continue;
        let v: number | undefined;
        if (typeof s.value === "number") v = s.value;
        else if (typeof s.value === "string") {
          const num = Number(s.value.replace("%", ""));
          v = Number.isFinite(num) ? num : undefined;
        }
        if (v != null) (out as any)[key] = v;
      }
      return out;
    });
  } catch {
    return [];
  }
}

// ===== API-Football 자체 예측 (third opinion) =====

export interface ApiFootballPrediction {
  winner: "HOME" | "DRAW" | "AWAY" | null;
  winnerComment?: string;
  homePct: number; // 0~1
  drawPct: number;
  awayPct: number;
  underOver?: string; // "+2.5" / "-1.5" 등 raw
  goals?: { home: string; away: string }; // 기대 골수 raw
  advice?: string;
}

export async function fetchFixturePredictions(
  fixtureId: number,
): Promise<ApiFootballPrediction | null> {
  try {
    const { data } = await client().get("/predictions", {
      params: { fixture: fixtureId },
    });
    const r = (data?.response ?? [])[0];
    if (!r) return null;
    const winnerId = r.predictions?.winner?.id ?? null;
    const homeId = r.teams?.home?.id;
    const awayId = r.teams?.away?.id;
    let winner: "HOME" | "DRAW" | "AWAY" | null = null;
    if (winnerId === homeId) winner = "HOME";
    else if (winnerId === awayId) winner = "AWAY";
    else if (winnerId === null && r.predictions?.win_or_draw === false)
      winner = "DRAW";

    const pct = r.predictions?.percent ?? {};
    const homePct = parsePct(pct.home);
    const drawPct = parsePct(pct.draw);
    const awayPct = parsePct(pct.away);
    return {
      winner,
      winnerComment: r.predictions?.winner?.comment,
      homePct,
      drawPct,
      awayPct,
      underOver: r.predictions?.under_over ?? undefined,
      goals: r.predictions?.goals
        ? { home: r.predictions.goals.home, away: r.predictions.goals.away }
        : undefined,
      advice: r.predictions?.advice,
    };
  } catch {
    return null;
  }
}

function parsePct(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace("%", ""));
  return Number.isFinite(n) ? n / 100 : 0;
}

// ===== 향후 N일 fixture 목록 (라인업 fetch 사전 단계) =====

export interface UpcomingFixture {
  fixtureId: number;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: number;
  awayTeamId: number;
}

export async function fetchUpcomingFixtures(
  league: string,
  fromDate: Date,
  toDate: Date,
): Promise<UpcomingFixture[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];
  const season = getApiFootballSeason(fromDate, league);
  try {
    const { data } = await client().get("/fixtures", {
      params: {
        league: lid,
        season,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
    });
    return (data?.response ?? []).map((r: any) => ({
      fixtureId: r.fixture.id,
      date: r.fixture.date,
      homeTeamName: r.teams.home.name,
      awayTeamName: r.teams.away.name,
      homeTeamId: r.teams.home.id,
      awayTeamId: r.teams.away.id,
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
  // 월드컵은 4년마다 단일 토너먼트. 다음 대회 = 2026 (북중미)
  if (league === "WORLD_CUP") return 2026;
  // MLS 는 단일 연도
  return date.getFullYear();
}
