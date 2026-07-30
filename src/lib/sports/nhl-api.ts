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


// === NHL 공식 API 원시 응답 shape ===
// 공식 타입 패키지가 없어 우리가 읽는 필드만 옵셔널로 적는다.
interface NhlLocalized { default?: string }
interface NhlGameLanding {
  matchup?: {
    goalieComparison?: {
      homeTeam?: { leaders?: unknown[] };
      awayTeam?: { leaders?: unknown[] };
    };
  };
}
interface NhlPlayerSeasonStats {
  goalsAgainstAvg?: number;
  savePctg?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  gamesPlayed?: number;
  shutouts?: number;
}
interface NhlGoalieLandingRaw {
  playerId?: number;
  firstName?: NhlLocalized;
  lastName?: NhlLocalized;
  fullTeamName?: NhlLocalized;
  shootsCatches?: string;
  birthCity?: NhlLocalized;
  birthCountry?: string;
  featuredStats?: {
    regularSeason?: { subSeason?: NhlPlayerSeasonStats };
    season?: { subSeason?: NhlPlayerSeasonStats };
  };
}
interface NhlGameLogRow {
  gameDate?: string;
  homeRoadFlag?: string;
  opponentAbbrev?: string;
  toi?: string;
  shotsAgainst?: number;
  goalsAgainst?: number;
  savePctg?: number;
  decision?: string;
}
interface NhlGameLogResponse { gameLog?: NhlGameLogRow[] }

/**
 * 한 매치의 양 팀 시즌 best goalie 조회.
 * NHL 은 매일 등판 골리가 매치 1~2시간 전 발표라 — leaders[0] 를
 * "예상 시작 골리" (시즌 most-played) 로 사용.
 */
export async function fetchGameGoalies(
  gamePk: number,
): Promise<{ home?: NhlGoalie; away?: NhlGoalie } | null> {
  let data: NhlGameLanding | undefined;
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
  let data: NhlGoalieLandingRaw | undefined;
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
  let data: NhlGameLogResponse | undefined;
  try {
    const r = await client.get(`/player/${pid}/game-log/${season}/${gameType}`);
    data = r.data;
  } catch {
    return [];
  }
  const games = data?.gameLog ?? [];
  // 날짜 없는 행은 그래프에 못 올리므로 버린다.
  return games.flatMap((g: NhlGameLogRow) => (g.gameDate ? [{
    date: g.gameDate,
    isHome: !!g.homeRoadFlag && g.homeRoadFlag === "H",
    opponent: g.opponentAbbrev ?? "?",
    toi: g.toi ?? "0:00",
    shotsAgainst: g.shotsAgainst ?? 0,
    goalsAgainst: g.goalsAgainst ?? 0,
    saves: (g.shotsAgainst ?? 0) - (g.goalsAgainst ?? 0),
    savePctg: g.savePctg,
    decision: g.decision,
  }] : []));
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
  /** 시즌별 NHL 정규시즌 기록 (최신순). seasonTotals 중 leagueAbbrev=NHL·정규만. */
  seasons?: NhlSeasonRow[];
  /** 수상 이력 (트로피명 + 횟수). */
  awards?: NhlAward[];
}

export interface NhlSeasonRow {
  season: number; // 20252026
  label: string; // "2025-26"
  team: string;
  gp: number;
  isGoalie: boolean;
  // skater
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  ppGoals: number;
  shots: number;
  toi: string; // 평균 TOI "22:59"
  // goalie
  wins?: number;
  losses?: number;
  otLosses?: number;
  savePctg?: number;
  gaa?: number;
  shutouts?: number;
}

export interface NhlAward {
  name: string;
  count: number;
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
  seasonTotals?: Array<{
    season: number;
    gameTypeId?: number;
    leagueAbbrev?: string;
    teamName?: { default?: string };
    gamesPlayed?: number;
    goals?: number;
    assists?: number;
    points?: number;
    plusMinus?: number;
    pim?: number;
    powerPlayGoals?: number;
    shots?: number;
    avgToi?: string;
    wins?: number;
    losses?: number;
    otLosses?: number;
    savePctg?: number;
    goalsAgainstAvg?: number;
    shutouts?: number;
  }>;
  awards?: Array<{ trophy?: { default?: string }; seasons?: unknown[] }>;
}

// NHL 시즌 코드(20252026) → "2025-26".
function nhlSeasonLabel(season: number): string {
  const s = String(season);
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(6, 8)}` : s;
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
    const isGoalie = d.position === "G";
    // seasonTotals 는 주니어·국제대회까지 섞여 있음 → NHL 정규시즌만.
    const seasons: NhlSeasonRow[] = (d.seasonTotals ?? [])
      .filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2)
      .map((s) => ({
        season: s.season,
        label: nhlSeasonLabel(s.season),
        team: s.teamName?.default ?? "",
        gp: s.gamesPlayed ?? 0,
        isGoalie,
        goals: s.goals ?? 0,
        assists: s.assists ?? 0,
        points: s.points ?? 0,
        plusMinus: s.plusMinus ?? 0,
        pim: s.pim ?? 0,
        ppGoals: s.powerPlayGoals ?? 0,
        shots: s.shots ?? 0,
        toi: s.avgToi ?? "",
        wins: s.wins,
        losses: s.losses,
        otLosses: s.otLosses,
        savePctg: s.savePctg,
        gaa: s.goalsAgainstAvg,
        shutouts: s.shutouts,
      }));
    const awards: NhlAward[] = (d.awards ?? [])
      .filter((a) => a.trophy?.default)
      .map((a) => ({ name: a.trophy!.default as string, count: a.seasons?.length ?? 0 }));
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
      seasons,
      awards,
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

// ===== NHL 팀 로스터 (/roster/{abbr}/{season}) — 팀 페이지 선수 명단 =====
//  id = nhlId → /players/{id}?league=NHL 선수 상세와 바로 연결.
export interface NhlRosterPlayer {
  id: number;
  name: string;
  position: string;
  number: number | null;
  headshot?: string;
  group: "F" | "D" | "G";
}

// roster/current 는 비시즌(여름) 빈 응답 → 시즌 명시. 현재 시즌 빈이면 직전 시즌 fallback.
export async function fetchNhlRoster(abbr: string, season: string): Promise<NhlRosterPlayer[]> {
  const prev = `${Number(season.slice(0, 4)) - 1}${Number(season.slice(4)) - 1}`;
  for (const s of [season, prev]) {
    try {
      const r = await fetch(`${BASE_URL}/roster/${abbr}/${s}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const d = (await r.json()) as Record<string, Array<{ id: number; firstName?: { default?: string }; lastName?: { default?: string }; positionCode?: string; sweaterNumber?: number; headshot?: string }>>;
      const out: NhlRosterPlayer[] = [];
      for (const [key, group] of [["forwards", "F"], ["defensemen", "D"], ["goalies", "G"]] as const) {
        for (const p of d[key] ?? []) {
          out.push({
            id: p.id,
            name: `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim(),
            position: p.positionCode ?? group,
            number: p.sweaterNumber ?? null,
            headshot: p.headshot,
            group,
          });
        }
      }
      if (out.length) return out;
    } catch {
      continue;
    }
  }
  return [];
}

// ===== NHL 시즌 순위 (/standings/now) — 공식 순위표 =====
// ⚠️ NHL 승점은 승=2·연장패(OTL)=1·정규패=0 — 축구식 calcStandings(승×3)와 다르다.
//    반드시 공식 API 값을 그대로 써야 순위가 맞는다.

export interface NhlStandingRow {
  abbrev: string; // "COL"
  name: string; // "Colorado Avalanche"
  placeName: string; // "Colorado"
  gamesPlayed: number;
  wins: number;
  losses: number;
  otLosses: number;
  points: number;
  /** 정규시간 승 — 동률 타이브레이커 1순위 */
  regulationWins: number;
  goalFor: number;
  goalAgainst: number;
  goalDiff: number;
  /** 컨퍼런스명 (Eastern/Western) */
  conference?: string;
  /** 디비전명 (Atlantic/Metropolitan/Central/Pacific) */
  division?: string;
  /** 진출 확정 표시 (p=프레지던츠 트로피, x=PO 확정, z=디비전 우승 등) */
  clinchIndicator?: string;
}

/**
 * NHL 공식 시즌 순위 — `/standings/now` (정규시즌 기준, 경기 종료 시 갱신).
 * season 은 raw 8자리("20252026"). rows 는 리그 전체 승점 내림차순 정렬.
 */
export async function fetchNhlStandings(): Promise<{
  season: string;
  rows: NhlStandingRow[];
} | null> {
  let data: { standings?: Record<string, unknown>[]; [k: string]: unknown };
  try {
    const r = await fetch(`${BASE_URL}/standings/now`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    data = await r.json();
  } catch (e) {
    console.warn("[nhl] standings 실패:", (e as Error).message);
    return null;
  }
  const std = data?.standings ?? [];
  if (std.length === 0) return null;

  const def = (v: unknown): string =>
    v && typeof v === "object" && "default" in v
      ? String((v as { default?: string }).default ?? "")
      : String(v ?? "");
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);

  const rows: NhlStandingRow[] = std.map((s) => ({
    abbrev: def(s.teamAbbrev),
    name: def(s.teamName),
    placeName: def(s.placeName),
    gamesPlayed: num(s.gamesPlayed),
    wins: num(s.wins),
    losses: num(s.losses),
    otLosses: num(s.otLosses),
    points: num(s.points),
    regulationWins: num(s.regulationWins),
    goalFor: num(s.goalFor),
    goalAgainst: num(s.goalAgainst),
    goalDiff: num(s.goalDifferential ?? num(s.goalFor) - num(s.goalAgainst)),
    conference: s.conferenceName ? def(s.conferenceName) : undefined,
    division: s.divisionName ? def(s.divisionName) : undefined,
    clinchIndicator: s.clinchIndicator ? String(s.clinchIndicator) : undefined,
  }));

  // API 가 컨퍼런스/디비전 순으로 줄 수 있어 리그 전체 순위로 재정렬
  // (승점 → 정규승(RW) → 골득실 — NHL 공식 타이브레이커 근사)
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.regulationWins - a.regulationWins ||
      b.goalDiff - a.goalDiff,
  );

  const season = String(
    (std[0] as { seasonId?: number })?.seasonId ?? "",
  );
  return { season, rows };
}
