// NHL 공식 API (api-web.nhle.com) — 무료, 인증 없음.
// 매치별 양 팀 best goalie + 시즌 통계 (GAA·SV%·W-L) 제공.

import axios from "axios";

const BASE_URL = "https://api-web.nhle.com/v1";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

export interface NhlGoalie {
  pid: number;
  name: string;
  gaa?: number;
  savePctg?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  gamesPlayed?: number;
  shutouts?: number;
  /** 시즌 best goalie 인지 (해당 팀 시즌 most-played goalie 일 때 true) */
  isBest?: boolean;
}

export interface NhlScheduledGame {
  gamePk: number;
  startTimeUTC: string;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeGoalie?: NhlGoalie;
  awayGoalie?: NhlGoalie;
}

interface ScheduleApiTeam {
  abbrev: string;
  placeName?: { default: string };
  commonName?: { default: string };
}
interface ScheduleApiGame {
  id: number;
  startTimeUTC: string;
  awayTeam: ScheduleApiTeam;
  homeTeam: ScheduleApiTeam;
}

function teamFullName(t: ScheduleApiTeam): string {
  const place = t.placeName?.default ?? "";
  const common = t.commonName?.default ?? "";
  return [place, common].filter(Boolean).join(" ").trim() || t.abbrev;
}

/**
 * 날짜별 NHL 일정. NHL API 의 /schedule/{date} 는 그 날짜 ET 기준 1주일치
 * gameWeek 를 반환하므로, 모든 day 의 games 를 합쳐서 반환한다.
 * (일부 매치는 호출 날짜와 다른 날에 잡힘 — 매칭은 startTimeUTC 로 함)
 */
export async function fetchNhlScheduleByDate(
  date: string,
): Promise<NhlScheduledGame[]> {
  const { data } = await client.get(`/schedule/${date}`);
  const out: NhlScheduledGame[] = [];
  for (const week of data?.gameWeek ?? []) {
    for (const g of (week.games ?? []) as ScheduleApiGame[]) {
      out.push({
        gamePk: g.id,
        startTimeUTC: g.startTimeUTC,
        homeTeamAbbrev: g.homeTeam.abbrev,
        awayTeamAbbrev: g.awayTeam.abbrev,
        homeTeamName: teamFullName(g.homeTeam),
        awayTeamName: teamFullName(g.awayTeam),
      });
    }
  }
  return out;
}

interface GoalieLeader {
  playerId: number;
  name: { default: string };
  gamesPlayed?: number;
  record?: string;
  gaa?: number;
  savePctg?: number;
  shutouts?: number;
}
interface GoalieSeasonStat {
  playerId: number;
  teamId: number;
  name: { default: string };
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  goalsAgainstAvg?: number;
  savePctg?: number;
  shutouts?: number;
}

function leaderToGoalie(l: GoalieLeader, isBest: boolean): NhlGoalie {
  // record "6-1" 또는 "6-1-0" 파싱
  let wins: number | undefined;
  let losses: number | undefined;
  let otLosses: number | undefined;
  if (l.record) {
    const parts = l.record.split("-").map((s) => Number(s));
    wins = parts[0];
    losses = parts[1];
    otLosses = parts[2];
  }
  return {
    pid: l.playerId,
    name: l.name?.default ?? "?",
    gaa: l.gaa,
    savePctg: l.savePctg,
    wins,
    losses,
    otLosses,
    gamesPlayed: l.gamesPlayed,
    shutouts: l.shutouts,
    isBest,
  };
}

function statToGoalie(s: GoalieSeasonStat, isBest: boolean): NhlGoalie {
  return {
    pid: s.playerId,
    name: s.name?.default ?? "?",
    gaa: s.goalsAgainstAvg,
    savePctg: s.savePctg,
    wins: s.wins,
    losses: s.losses,
    otLosses: s.otLosses,
    gamesPlayed: s.gamesPlayed,
    shutouts: s.shutouts,
    isBest,
  };
}

/**
 * 한 매치의 양 팀 시즌 best goalie 조회.
 * NHL 은 매일 등판 골리가 매치 1~2시간 전 발표라 — leaders[0] 를
 * "예상 시작 골리" (시즌 most-played) 로 사용.
 */
export async function fetchGameGoalies(
  gamePk: number,
): Promise<{ home?: NhlGoalie; away?: NhlGoalie } | null> {
  let data: any;
  try {
    const r = await client.get(`/gamecenter/${gamePk}/landing`);
    data = r.data;
  } catch {
    return null;
  }
  const mg = data?.matchup?.goalieComparison;
  if (!mg) return null;
  const homeLeaders = (mg.homeTeam?.leaders ?? []) as GoalieLeader[];
  const awayLeaders = (mg.awayTeam?.leaders ?? []) as GoalieLeader[];
  return {
    home: homeLeaders[0] ? leaderToGoalie(homeLeaders[0], true) : undefined,
    away: awayLeaders[0] ? leaderToGoalie(awayLeaders[0], true) : undefined,
  };
}

/** 한 골리의 시즌 통계 (선수 페이지용 — `/player/{pid}/landing`). */
export async function fetchGoalieProfile(pid: number): Promise<NhlGoalie & {
  team?: string;
  age?: number;
  catches?: string;
  birthCity?: string;
  birthCountry?: string;
} | null> {
  let data: any;
  try {
    const r = await client.get(`/player/${pid}/landing`);
    data = r.data;
  } catch {
    return null;
  }
  if (!data?.playerId) return null;
  const featured = data.featuredStats?.regularSeason?.subSeason ?? data.featuredStats?.season?.subSeason;
  return {
    pid: data.playerId,
    name: `${data.firstName?.default ?? ""} ${data.lastName?.default ?? ""}`.trim(),
    team: data.fullTeamName?.default,
    age: undefined, // birthDate 로 계산 가능
    catches: data.shootsCatches,
    birthCity: data.birthCity?.default,
    birthCountry: data.birthCountry,
    gaa: featured?.goalsAgainstAvg,
    savePctg: featured?.savePctg,
    wins: featured?.wins,
    losses: featured?.losses,
    otLosses: featured?.otLosses,
    gamesPlayed: featured?.gamesPlayed,
    shutouts: featured?.shutouts,
  };
}

/** 골리의 최근 등판 게임바이게임 — `/player/{pid}/game-log/{season}/{gameType}` */
export interface NhlGoalieGameLog {
  date: string; // YYYY-MM-DD
  isHome: boolean;
  opponent: string;
  toi: string; // "57:08"
  shotsAgainst: number;
  goalsAgainst: number;
  saves: number;
  savePctg?: number;
  decision?: string; // "W" / "L" / "OT"
}

export async function fetchGoalieGameLog(
  pid: number,
  season: number,
  /** 2 = regular, 3 = playoffs. now=현재 시즌 추정 */
  gameType: number = 2,
): Promise<NhlGoalieGameLog[]> {
  let data: any;
  try {
    const r = await client.get(`/player/${pid}/game-log/${season}/${gameType}`);
    data = r.data;
  } catch {
    return [];
  }
  const games = data?.gameLog ?? [];
  return games.map((g: any) => ({
    date: g.gameDate,
    isHome: !!g.homeRoadFlag && g.homeRoadFlag === "H",
    opponent: g.opponentAbbrev ?? "?",
    toi: g.toi ?? "0:00",
    shotsAgainst: g.shotsAgainst ?? 0,
    goalsAgainst: g.goalsAgainst ?? 0,
    saves: (g.shotsAgainst ?? 0) - (g.goalsAgainst ?? 0),
    savePctg: g.savePctg,
    decision: g.decision,
  }));
}

// ===== NHL 선수 페이지 (/players/[id]?league=NHL) =====

export interface NhlPlayerLanding {
  pid: number;
  firstName: string;
  lastName: string;
  position?: string; // C / L / R / D / G
  jerseyNumber?: number;
  headshot?: string;
  heroImage?: string;
  heightCm?: number;
  weightKg?: number;
  birthDate?: string;
  birthCity?: string;
  birthCountry?: string;
  shootsCatches?: string;
  teamId?: number;
  teamAbbr?: string;
  teamFullName?: string;
  draftYear?: number;
  draftRound?: number;
  draftOverall?: number;
  /** 시즌 누적 (skater 또는 goalie) */
  featured?: NhlFeaturedStats;
  career?: NhlCareerTotals;
}

export interface NhlFeaturedStats {
  /** skater: goals/assists/points/plusMinus/pim/gameWinningGoals/otGoals/ppGoals/shGoals/shots/sog */
  /** goalie: gamesPlayed/wins/losses/otLosses/savePctg/goalsAgainstAvg/shutouts */
  [key: string]: number | undefined;
}

export interface NhlCareerTotals {
  gamesPlayed?: number;
  goals?: number;
  assists?: number;
  points?: number;
  plusMinus?: number;
  shots?: number;
  pim?: number;
  shootingPctg?: number;
  // goalie
  wins?: number;
  losses?: number;
  shutouts?: number;
  savePctg?: number;
  goalsAgainstAvg?: number;
}

export interface NhlPlayerGameLog {
  gameDate: string;
  homeRoadFlag: "H" | "R";
  opponentAbbrev: string;
  teamAbbrev: string;
  goals: number;
  assists: number;
  points: number;
  plusMinus?: number;
  shots: number;
  pim: number;
  toi: string; // "16:32"
}

interface RawNhlLanding {
  playerId: number;
  firstName?: { default?: string };
  lastName?: { default?: string };
  position?: string;
  sweaterNumber?: number;
  headshot?: string;
  heroImage?: string;
  heightInCentimeters?: number;
  weightInKilograms?: number;
  birthDate?: string;
  birthCity?: { default?: string };
  birthCountry?: string;
  shootsCatches?: string;
  currentTeamId?: number;
  currentTeamAbbrev?: string;
  fullTeamName?: { default?: string };
  draftDetails?: { year?: number; round?: number; overallPick?: number };
  featuredStats?: { regularSeason?: { subSeason?: Record<string, number> } };
  careerTotals?: { regularSeason?: Record<string, number> };
}

export async function fetchNhlPlayerLanding(
  pid: number,
): Promise<NhlPlayerLanding | null> {
  try {
    const r = await fetch(`${BASE_URL}/player/${pid}/landing`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as RawNhlLanding;
    if (!d.playerId) return null;
    const featured = d.featuredStats?.regularSeason?.subSeason ?? {};
    const career = d.careerTotals?.regularSeason ?? {};
    return {
      pid: d.playerId,
      firstName: d.firstName?.default ?? "",
      lastName: d.lastName?.default ?? "",
      position: d.position,
      jerseyNumber: d.sweaterNumber,
      headshot: d.headshot,
      heroImage: d.heroImage,
      heightCm: d.heightInCentimeters,
      weightKg: d.weightInKilograms,
      birthDate: d.birthDate,
      birthCity: d.birthCity?.default,
      birthCountry: d.birthCountry,
      shootsCatches: d.shootsCatches,
      teamId: d.currentTeamId,
      teamAbbr: d.currentTeamAbbrev,
      teamFullName: d.fullTeamName?.default,
      draftYear: d.draftDetails?.year,
      draftRound: d.draftDetails?.round,
      draftOverall: d.draftDetails?.overallPick,
      featured,
      career: career as NhlCareerTotals,
    };
  } catch (e) {
    console.warn("[nhl] landing 실패:", (e as Error).message);
    return null;
  }
}

export async function fetchNhlPlayerGameLog(
  pid: number,
  season: string,
  gameType: 2 | 3 = 2, // 2=정규, 3=플레이오프
  limit = 10,
): Promise<NhlPlayerGameLog[]> {
  try {
    const r = await fetch(
      `${BASE_URL}/player/${pid}/game-log/${season}/${gameType}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) },
    );
    if (!r.ok) return [];
    interface Row {
      gameDate: string;
      homeRoadFlag: "H" | "R";
      opponentAbbrev: string;
      teamAbbrev: string;
      goals: number;
      assists: number;
      points: number;
      plusMinus?: number;
      shots?: number;
      pim?: number;
      toi?: string;
    }
    const d = (await r.json()) as { gameLog?: Row[] };
    return (d.gameLog ?? []).slice(0, limit).map((g) => ({
      gameDate: g.gameDate,
      homeRoadFlag: g.homeRoadFlag,
      opponentAbbrev: g.opponentAbbrev,
      teamAbbrev: g.teamAbbrev,
      goals: g.goals,
      assists: g.assists,
      points: g.points,
      plusMinus: g.plusMinus,
      shots: g.shots ?? 0,
      pim: g.pim ?? 0,
      toi: g.toi ?? "—",
    }));
  } catch (e) {
    console.warn("[nhl] game log 실패:", (e as Error).message);
    return [];
  }
}
