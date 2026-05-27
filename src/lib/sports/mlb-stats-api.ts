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
  /** MLB Stats API abstractGameState — "Preview" | "Live" | "Final". boxscore fallback 분기용 */
  abstractGameState?: string;
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
        abstractGameState: g.status?.abstractGameState,
      });
    }
  }
  return out;
}

/**
 * 매치 시작 후 actual 선발 투수 — boxscore endpoint.
 * schedule 의 probablePitcher 가 미정/지연된 팀(예: 텍사스)에 대한 fallback.
 *
 * pitchers 배열은 등판 순서이므로 [0] = 선발. 한 쪽이라도 비어있으면 그 쪽만 undefined.
 * (예: 경기 직전 호출 시 home 만 채워졌을 수 있음)
 */
export async function fetchMlbBoxscoreStarters(gamePk: number): Promise<{
  home?: { pid: number; name: string };
  away?: { pid: number; name: string };
}> {
  const { data } = await client.get(`/game/${gamePk}/boxscore`);
  const result: { home?: { pid: number; name: string }; away?: { pid: number; name: string } } = {};
  for (const side of ["home", "away"] as const) {
    const t = data?.teams?.[side];
    const pitchers: number[] = t?.pitchers ?? [];
    const pid = pitchers[0];
    if (!pid) continue;
    const player = t?.players?.[`ID${pid}`];
    const name: string | undefined = player?.person?.fullName;
    if (name) result[side] = { pid, name };
  }
  return result;
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

/* ============================================================
 * 타자 — 시즌 stats + 최근 game log (Player Page 용)
 * ==========================================================*/

export interface HitterProfile {
  pid: number;
  name: string;
  bats?: string; // L | R | S
  throws?: string;
  age?: number;
  birthCity?: string;
  birthCountry?: string;
  team?: string;
  position?: string; // OF, 1B, 2B, ...
  /** 시즌 누적 타격 통계 */
  season?: {
    games?: number;
    avg?: string;
    hr?: number;
    rbi?: number;
    sb?: number;
    obp?: string;
    slg?: string;
    ops?: string;
    hits?: number;
    runs?: number;
    doubles?: number;
    triples?: number;
    so?: number;
    bb?: number;
    pa?: number;
    ab?: number;
  };
}

export interface HitterRecentGame {
  date: string;
  isHome: boolean;
  opponent: string;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  r: number;
  so: number;
  bb: number;
  sb: number;
  avg: string;
}

export async function fetchHitterProfile(
  personId: number,
  season: number,
): Promise<HitterProfile | null> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=hitting,type=season,season=${season}),currentTeam`,
    },
  });
  const p = data?.people?.[0];
  if (!p) return null;
  const profile: HitterProfile = {
    pid: personId,
    name: p.fullName,
    bats: p.batSide?.code,
    throws: p.pitchHand?.code,
    age: p.currentAge,
    birthCity: p.birthCity,
    birthCountry: p.birthCountry,
    team: p.currentTeam?.name,
    position: p.primaryPosition?.abbreviation,
  };
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName === "hitting") {
      const split = grp.splits?.[0];
      const s = split?.stat ?? {};
      profile.season = {
        games: s.gamesPlayed,
        avg: s.avg,
        hr: s.homeRuns,
        rbi: s.rbi,
        sb: s.stolenBases,
        obp: s.obp,
        slg: s.slg,
        ops: s.ops,
        hits: s.hits,
        runs: s.runs,
        doubles: s.doubles,
        triples: s.triples,
        so: s.strikeOuts,
        bb: s.baseOnBalls,
        pa: s.plateAppearances,
        ab: s.atBats,
      };
      break;
    }
  }
  return profile;
}

export async function fetchHitterRecent(
  personId: number,
  season: number,
  limit = 10,
): Promise<HitterRecentGame[]> {
  const { data } = await client.get(`/people/${personId}`, {
    params: { hydrate: `stats(group=hitting,type=gameLog,season=${season})` },
  });
  const p = data?.people?.[0];
  if (!p) return [];
  const out: HitterRecentGame[] = [];
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName === "hitting") {
      const splits = grp.splits ?? [];
      for (const sp of splits) {
        const s = sp.stat ?? {};
        out.push({
          date: sp.date,
          isHome: !!sp.isHome,
          opponent: sp.opponent?.name ?? "?",
          ab: s.atBats ?? 0,
          h: s.hits ?? 0,
          hr: s.homeRuns ?? 0,
          rbi: s.rbi ?? 0,
          r: s.runs ?? 0,
          so: s.strikeOuts ?? 0,
          bb: s.baseOnBalls ?? 0,
          sb: s.stolenBases ?? 0,
          avg: s.avg ?? "—",
        });
      }
      break;
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** MLB Stats API person id → 헤드샷 URL. */
export function mlbHeadshotUrl(pid: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${pid}/headshot/67/current`;
}

/* ============================================================
 * Full Boxscore — 라인업 + 박스스코어 탭용
 * 우리 DB 매치 (ESPN game id) → MLB Stats gamePk → boxscore
 * ==========================================================*/

/**
 * 우리 DB 매치 startTime + 팀명 → MLB Stats API gamePk.
 *
 * Timezone: UTC 일자 ≠ MLB schedule (ET) 일자.
 * ET 늦은 저녁 (UTC 새벽) 매치를 UTC day 로만 lookup 하면 다음날 schedule 에 빠지고,
 * 같은 두 팀의 다른 시리즈 매치 gamePk 가 잡혀 boxscore 빈 응답이 됨.
 * → ±1 day range 로 schedule fetch + startTime 와 가장 가까운 gamePk 선택.
 */
export async function findMlbGamePk(
  dateISO: string,
  homeTeamName: string,
  awayTeamName: string,
): Promise<number | null> {
  const refTs = new Date(dateISO).getTime();
  const prev = new Date(refTs - 86400_000).toISOString().slice(0, 10);
  const next = new Date(refTs + 86400_000).toISOString().slice(0, 10);
  try {
    const { data } = await client.get("/schedule", {
      params: { sportId: 1, startDate: prev, endDate: next },
    });
    const games: ScheduleGame[] = [];
    for (const d of data?.dates ?? []) {
      for (const g of (d.games ?? []) as ScheduleGame[]) games.push(g);
    }
    if (games.length === 0) return null;

    // 후보 1) 영문 풀네임 정확 매칭
    let candidates = games.filter(
      (g) =>
        g.teams.home.team.name === homeTeamName &&
        g.teams.away.team.name === awayTeamName,
    );
    // 후보 2) contains 양방향
    if (candidates.length === 0) {
      const homeLc = homeTeamName.toLowerCase();
      const awayLc = awayTeamName.toLowerCase();
      candidates = games.filter((g) => {
        const h = g.teams.home.team.name.toLowerCase();
        const a = g.teams.away.team.name.toLowerCase();
        return (
          (h.includes(homeLc) || homeLc.includes(h)) &&
          (a.includes(awayLc) || awayLc.includes(a))
        );
      });
    }
    // 후보 3) 마지막 토큰 매칭
    if (candidates.length === 0) {
      const homeTok = homeTeamName.split(/\s+/).slice(-1)[0]?.toLowerCase();
      const awayTok = awayTeamName.split(/\s+/).slice(-1)[0]?.toLowerCase();
      if (homeTok && awayTok) {
        candidates = games.filter((g) => {
          const h = g.teams.home.team.name.toLowerCase();
          const a = g.teams.away.team.name.toLowerCase();
          return h.includes(homeTok) && a.includes(awayTok);
        });
      }
    }
    if (candidates.length === 0) return null;

    // 후보 중 startTime 과 가장 가까운 gameDate 선택 (doubleheader / 시리즈 분기).
    candidates.sort((a, b) => {
      const da = Math.abs(new Date(a.gameDate).getTime() - refTs);
      const db = Math.abs(new Date(b.gameDate).getTime() - refTs);
      return da - db;
    });
    return candidates[0].gamePk;
  } catch {
    return null;
  }
}

export interface MlbBoxBatter {
  pid: number;
  name: string;
  /** 1~9 (선발 라인업). 대타/대수비는 null. */
  order: number | null;
  /** 선발 = true, 교체 = false */
  isStarter: boolean;
  position: string;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  so: number;
  hr: number;
  /** ".322" 형태 */
  avgGame: string;
  // 시즌 누적
  seasonAvg: string;
  seasonHr: number;
  seasonRbi: number;
  seasonOps: string;
}

export interface MlbBoxPitcher {
  pid: number;
  name: string;
  isStarter: boolean;
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  pitchCount?: number;
  // 시즌
  seasonEra: string;
  seasonWhip: string;
  seasonW: number;
  seasonL: number;
}

export interface MlbFullBoxscoreSide {
  batters: MlbBoxBatter[];
  pitchers: MlbBoxPitcher[];
}

export interface MlbFullBoxscore {
  gamePk: number;
  home: MlbFullBoxscoreSide;
  away: MlbFullBoxscoreSide;
}

interface BoxPlayer {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string };
  /** "100" = 1번 선발, "101" = 1번 교체. 100 단위. 없으면 라인업 외. */
  battingOrder?: string;
  stats?: {
    batting?: Record<string, number | string | undefined>;
    pitching?: Record<string, number | string | undefined>;
  };
  seasonStats?: {
    batting?: Record<string, number | string | undefined>;
    pitching?: Record<string, number | string | undefined>;
  };
}

interface BoxTeam {
  battingOrder?: number[];
  pitchers?: number[];
  players?: Record<string, BoxPlayer>;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function str(v: unknown, fallback = "-"): string {
  if (v == null || v === "") return fallback;
  return String(v);
}

function extractSide(team: BoxTeam | undefined): MlbFullBoxscoreSide {
  if (!team || !team.players) return { batters: [], pitchers: [] };
  const players = team.players;
  const batterIds = team.battingOrder ?? [];
  const batterIdSet = new Set(batterIds);
  const pitcherIds = team.pitchers ?? [];

  const batters: MlbBoxBatter[] = [];
  // 1) 선발 라인업 — battingOrder 배열 순서
  for (let i = 0; i < batterIds.length; i++) {
    const p = players[`ID${batterIds[i]}`];
    if (!p) continue;
    batters.push(toBatter(p, i + 1, true));
  }
  // 2) 대타/대수비 — players 중 battingOrder 가 있고 set 에 없는 사람
  for (const key of Object.keys(players)) {
    const p = players[key];
    const pid = p.person?.id;
    if (!pid || batterIdSet.has(pid)) continue;
    const bo = p.battingOrder;
    if (!bo) continue;
    batters.push(toBatter(p, null, false));
  }

  const pitchers: MlbBoxPitcher[] = [];
  for (let i = 0; i < pitcherIds.length; i++) {
    const p = players[`ID${pitcherIds[i]}`];
    if (!p) continue;
    pitchers.push(toPitcher(p, i === 0));
  }

  return { batters, pitchers };
}

function toBatter(
  p: BoxPlayer,
  order: number | null,
  isStarter: boolean,
): MlbBoxBatter {
  const g = p.stats?.batting ?? {};
  const s = p.seasonStats?.batting ?? {};
  return {
    pid: p.person?.id ?? 0,
    name: p.person?.fullName ?? "?",
    order,
    isStarter,
    position: p.position?.abbreviation ?? "",
    ab: num(g.atBats),
    r: num(g.runs),
    h: num(g.hits),
    rbi: num(g.rbi),
    bb: num(g.baseOnBalls),
    so: num(g.strikeOuts),
    hr: num(g.homeRuns),
    avgGame: str(g.avg, ".000"),
    seasonAvg: str(s.avg, ".000"),
    seasonHr: num(s.homeRuns),
    seasonRbi: num(s.rbi),
    seasonOps: str(s.ops, "-"),
  };
}

function toPitcher(p: BoxPlayer, isStarter: boolean): MlbBoxPitcher {
  const g = p.stats?.pitching ?? {};
  const s = p.seasonStats?.pitching ?? {};
  return {
    pid: p.person?.id ?? 0,
    name: p.person?.fullName ?? "?",
    isStarter,
    ip: str(g.inningsPitched, "0.0"),
    h: num(g.hits),
    r: num(g.runs),
    er: num(g.earnedRuns),
    bb: num(g.baseOnBalls),
    so: num(g.strikeOuts),
    hr: num(g.homeRuns),
    pitchCount: g.numberOfPitches != null ? num(g.numberOfPitches) : undefined,
    seasonEra: str(s.era, "-"),
    seasonWhip: str(s.whip, "-"),
    seasonW: num(s.wins),
    seasonL: num(s.losses),
  };
}

/** 전체 박스스코어 (라인업 + 타자/투수 게임 통계 + 시즌 통계). */
export async function fetchMlbFullBoxscore(
  gamePk: number,
): Promise<MlbFullBoxscore | null> {
  try {
    const { data } = await client.get(`/game/${gamePk}/boxscore`);
    return {
      gamePk,
      home: extractSide(data?.teams?.home),
      away: extractSide(data?.teams?.away),
    };
  } catch {
    return null;
  }
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
