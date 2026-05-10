// MLB 공식 Stats API (statsapi.mlb.com) — 무료, 인증 없음.
// 선발 투수 / 시즌 통계 / 라인업 정보 제공.
//
// MLB 매치는 보통 1~3일 전부터 probablePitcher 가 published.
// 우리 DB 의 MLB 매치에 매일 자동으로 채워 넣는다.

import axios from "axios";

const BASE_URL = "https://statsapi.mlb.com/api/v1";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

interface ProbablePitcher {
  id: number;
  fullName: string;
}
interface ScheduleTeam {
  team: { id: number; name: string };
  probablePitcher?: ProbablePitcher;
}
interface ScheduleGame {
  gamePk: number;
  gameDate: string;
  status?: { abstractGameState?: string; statusCode?: string };
  teams: { home: ScheduleTeam; away: ScheduleTeam };
}

export interface MlbStarter {
  /** MLB Stats API 선수 ID */
  pid: number;
  name: string;
  /** 던지는 손 (L / R / S) */
  hand?: string;
  era?: number;
  whip?: number;
  k9?: number; // K/9 inn
  wins?: number;
  losses?: number;
  /** Games Started (선발 등판 수) */
  gs?: number;
  /** Innings Pitched (예: "41.0") */
  ip?: string;
}

export interface MlbScheduledGame {
  gamePk: number;
  date: string;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeStarter?: MlbStarter;
  awayStarter?: MlbStarter;
}

/**
 * 날짜별 MLB 일정 + 선발 투수 (이름·ID 만).
 * 시즌 통계는 따로 fetchPitcherStats() 로 보강.
 */
export async function fetchMlbScheduleWithStarters(
  date: string,
): Promise<MlbScheduledGame[]> {
  const { data } = await client.get("/schedule", {
    params: {
      sportId: 1, // MLB
      date,
      hydrate: "probablePitcher,team",
    },
  });
  const out: MlbScheduledGame[] = [];
  for (const d of data?.dates ?? []) {
    for (const g of (d.games ?? []) as ScheduleGame[]) {
      out.push({
        gamePk: g.gamePk,
        date: g.gameDate,
        homeTeamId: g.teams.home.team.id,
        homeTeamName: g.teams.home.team.name,
        awayTeamId: g.teams.away.team.id,
        awayTeamName: g.teams.away.team.name,
        homeStarter: g.teams.home.probablePitcher
          ? { pid: g.teams.home.probablePitcher.id, name: g.teams.home.probablePitcher.fullName }
          : undefined,
        awayStarter: g.teams.away.probablePitcher
          ? { pid: g.teams.away.probablePitcher.id, name: g.teams.away.probablePitcher.fullName }
          : undefined,
      });
    }
  }
  return out;
}

/** 한 선수의 시즌 피칭 통계 + 던지는 손. */
export async function fetchPitcherStats(
  personId: number,
  season: number,
): Promise<Partial<MlbStarter>> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=season,season=${season})`,
    },
  });
  const p = data?.people?.[0];
  if (!p) return {};
  const out: Partial<MlbStarter> = {
    pid: personId,
    name: p.fullName,
    hand: p.pitchHand?.code,
  };
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName === "pitching") {
      const split = grp.splits?.[0];
      const s = split?.stat ?? {};
      out.era = s.era != null ? Number(s.era) : undefined;
      out.whip = s.whip != null ? Number(s.whip) : undefined;
      out.k9 = s.strikeoutsPer9Inn != null ? Number(s.strikeoutsPer9Inn) : undefined;
      out.wins = s.wins;
      out.losses = s.losses;
      out.gs = s.gamesStarted;
      out.ip = s.inningsPitched;
      break;
    }
  }
  return out;
}

export interface PitcherProfile {
  pid: number;
  name: string;
  hand?: string;
  age?: number;
  birthCity?: string;
  birthCountry?: string;
  team?: string;
  /** 시즌 누적 통계 */
  season?: {
    era?: number;
    whip?: number;
    k9?: number;
    wins?: number;
    losses?: number;
    gs?: number;
    ip?: string;
    so?: number;
    bb?: number;
    hra?: number;
    avg?: string;
  };
}

export interface PitcherRecentGame {
  date: string; // YYYY-MM-DD
  isHome: boolean;
  opponent: string;
  ip: string;
  er: number;
  so: number;
  bb: number;
  hits: number;
  era: string;
  decision?: string; // "W" / "L" / null
}

/** 선수 상세 + 시즌 통계 (한 번에). */
export async function fetchPitcherProfile(
  personId: number,
  season: number,
): Promise<PitcherProfile | null> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=season,season=${season}),currentTeam`,
    },
  });
  const p = data?.people?.[0];
  if (!p) return null;
  const profile: PitcherProfile = {
    pid: personId,
    name: p.fullName,
    hand: p.pitchHand?.code,
    age: p.currentAge,
    birthCity: p.birthCity,
    birthCountry: p.birthCountry,
    team: p.currentTeam?.name,
  };
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName === "pitching") {
      const split = grp.splits?.[0];
      const s = split?.stat ?? {};
      profile.season = {
        era: s.era != null ? Number(s.era) : undefined,
        whip: s.whip != null ? Number(s.whip) : undefined,
        k9: s.strikeoutsPer9Inn != null ? Number(s.strikeoutsPer9Inn) : undefined,
        wins: s.wins,
        losses: s.losses,
        gs: s.gamesStarted,
        ip: s.inningsPitched,
        so: s.strikeOuts,
        bb: s.baseOnBalls,
        hra: s.homeRuns,
        avg: s.avg,
      };
      break;
    }
  }
  return profile;
}

/** 한 선수의 시즌 등판 로그 (game-by-game). */
export async function fetchPitcherRecent(
  personId: number,
  season: number,
  limit = 10,
): Promise<PitcherRecentGame[]> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=gameLog,season=${season})`,
    },
  });
  const p = data?.people?.[0];
  if (!p) return [];
  const out: PitcherRecentGame[] = [];
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName === "pitching") {
      const splits = grp.splits ?? [];
      for (const sp of splits) {
        const s = sp.stat ?? {};
        out.push({
          date: sp.date,
          isHome: !!sp.isHome,
          opponent: sp.opponent?.name ?? "?",
          ip: s.inningsPitched ?? "0.0",
          er: s.earnedRuns ?? 0,
          so: s.strikeOuts ?? 0,
          bb: s.baseOnBalls ?? 0,
          hits: s.hits ?? 0,
          era: s.era ?? "—",
          decision:
            s.wins ? "W" : s.losses ? "L" : s.holds ? "H" : s.saves ? "S" : undefined,
        });
      }
      break;
    }
  }
  // 최근 순으로 정렬 후 limit
  return out
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/**
 * 한 매치의 선발 투수 정보를 전체 (이름·ID + 시즌 통계) fetch.
 * homeStarter / awayStarter 가 둘 다 미정이면 null.
 */
export async function enrichGameStarters(
  game: MlbScheduledGame,
  season: number,
): Promise<{ home?: MlbStarter; away?: MlbStarter }> {
  const result: { home?: MlbStarter; away?: MlbStarter } = {};
  if (game.homeStarter) {
    const stats = await fetchPitcherStats(game.homeStarter.pid, season);
    result.home = { ...game.homeStarter, ...stats };
  }
  if (game.awayStarter) {
    const stats = await fetchPitcherStats(game.awayStarter.pid, season);
    result.away = { ...game.awayStarter, ...stats };
  }
  return result;
}
