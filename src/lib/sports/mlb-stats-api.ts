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
  /** 최근 3등판 ERA (ER·IP 합산 — 등판별 평균 아님) */
  recentEra?: number;
  /** 최근 3등판 평균 이닝 */
  recentIp?: number;
  /** 최근 3등판 평균 투구수 */
  recentPitches?: number;
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

export interface MlbBullpenUsage {
  teamName: string;
  /** 불펜(선발 제외) 투구수 합 */
  pitches: number;
  /** 불펜 등판 인원 수 */
  appearances: number;
}

/**
 * 한 매치의 양 팀 불펜 사용량 — boxscore pitchers[1..] (등판 순서, [0]=선발) 의
 * numberOfPitches 합산. 불펜 피로도 집계용.
 */
export async function fetchMlbBoxscoreBullpen(gamePk: number): Promise<{
  home?: MlbBullpenUsage;
  away?: MlbBullpenUsage;
}> {
  const { data } = await client.get(`/game/${gamePk}/boxscore`);
  const result: { home?: MlbBullpenUsage; away?: MlbBullpenUsage } = {};
  for (const side of ["home", "away"] as const) {
    const t = data?.teams?.[side];
    const teamName: string | undefined = t?.team?.name;
    if (!teamName) continue;
    const pitchers: number[] = t?.pitchers ?? [];
    let pitches = 0;
    let appearances = 0;
    for (const pid of pitchers.slice(1)) {
      const stat = t?.players?.[`ID${pid}`]?.stats?.pitching;
      if (!stat) continue;
      pitches += Number(stat.numberOfPitches ?? 0);
      appearances++;
    }
    result[side] = { teamName, pitches, appearances };
  }
  return result;
}

/**
 * 야구 IP 표기 → 실수 이닝. MLB/KBO 공통 dot 표기 — ".1"=1/3, ".2"=2/3.
 *   "5.2" → 5 + 2/3
 */
export function mlbIpToInnings(ip: string | undefined): number {
  if (!ip) return 0;
  const m = ip.trim().match(/^(\d+)(?:\.([12]))?(?:\.0)?$/);
  if (!m) {
    const n = Number(ip);
    return Number.isFinite(n) ? n : 0;
  }
  return Number(m[1]) + (m[2] ? Number(m[2]) / 3 : 0);
}

export interface PitcherGameLogEntry {
  date: string; // YYYY-MM-DD
  /** 실수 이닝 (5.2 표기 → 5.667 변환 완료) */
  innings: number;
  er: number;
  pitches?: number;
  /** 선발 등판 여부 */
  started: boolean;
}

export interface PitcherRecentForm {
  recentEra: number;
  recentIp: number;
  recentPitches?: number;
  /** 집계에 쓴 등판 수 (2~lastN) */
  starts: number;
}

/**
 * gameLog → 최근 N 선발등판 폼. walk-forward 백테스트용 beforeDate(exclusive) 지원.
 * 선발등판 2회 미만 또는 합산 IP 2 미만이면 null (표본 부족 — ERA 왜곡 방지).
 */
export function computeRecentFormFromLog(
  log: PitcherGameLogEntry[],
  opts?: { lastN?: number; beforeDate?: string },
): PitcherRecentForm | null {
  const lastN = opts?.lastN ?? 3;
  const games = log
    .filter((g) => g.started && (!opts?.beforeDate || g.date < opts.beforeDate))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, lastN);
  if (games.length < 2) return null;
  const sumIp = games.reduce((s, g) => s + g.innings, 0);
  const sumEr = games.reduce((s, g) => s + g.er, 0);
  if (sumIp < 2) return null;
  const withPitches = games.filter((g) => g.pitches != null);
  return {
    recentEra: Math.min(27, (sumEr * 9) / sumIp),
    recentIp: sumIp / games.length,
    recentPitches:
      withPitches.length > 0
        ? withPitches.reduce((s, g) => s + (g.pitches ?? 0), 0) / withPitches.length
        : undefined,
    starts: games.length,
  };
}

/** people API 응답의 stats 그룹에서 pitching gameLog splits → entries. */
function parsePitcherGameLog(
  stats: Array<{
    type?: { displayName?: string };
    group?: { displayName?: string };
    splits?: Array<{
      date?: string;
      stat?: Record<string, unknown>;
    }>;
  }>,
): PitcherGameLogEntry[] {
  const out: PitcherGameLogEntry[] = [];
  for (const grp of stats ?? []) {
    if (grp?.group?.displayName !== "pitching") continue;
    if (grp?.type?.displayName !== "gameLog") continue;
    for (const sp of grp.splits ?? []) {
      const s = sp.stat ?? {};
      if (!sp.date) continue;
      out.push({
        date: sp.date,
        innings: mlbIpToInnings(s.inningsPitched as string | undefined),
        er: Number(s.earnedRuns ?? 0),
        pitches:
          s.numberOfPitches != null ? Number(s.numberOfPitches) : undefined,
        started: Number(s.gamesStarted ?? 0) > 0,
      });
    }
  }
  return out;
}

/** 한 선수의 시즌 gameLog (등판별). 백테스트 백필용. */
export async function fetchPitcherGameLog(
  personId: number,
  season: number,
): Promise<PitcherGameLogEntry[]> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=gameLog,season=${season})`,
    },
  });
  const p = data?.people?.[0];
  if (!p) return [];
  return parsePitcherGameLog(p.stats ?? []);
}

/**
 * 한 선수의 시즌 피칭 통계 + 던지는 손 + 최근 3등판 폼.
 * hydrate type=[season,gameLog] 통합 — API 1콜로 둘 다 수신 (추가 호출 0).
 */
export async function fetchPitcherStats(
  personId: number,
  season: number,
): Promise<Partial<MlbStarter>> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=[season,gameLog],season=${season})`,
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
    if (grp?.group?.displayName === "pitching" && grp?.type?.displayName === "season") {
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
  const recent = computeRecentFormFromLog(parsePitcherGameLog(p.stats ?? []));
  if (recent) {
    out.recentEra = Number(recent.recentEra.toFixed(2));
    out.recentIp = Number(recent.recentIp.toFixed(1));
    out.recentPitches =
      recent.recentPitches != null ? Math.round(recent.recentPitches) : undefined;
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
  number?: string; // 등번호
  height?: string; // "6' 4""
  weight?: number; // lb
  debut?: string; // MLB 데뷔일 YYYY-MM-DD
  draft?: string; // 예: "2013 드래프트 1R 전체 32픽"
  school?: string; // 출신 대학/고교
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
  /** 통산(career) 통계 */
  career?: {
    era?: number;
    whip?: number;
    so?: number;
    wins?: number;
    losses?: number;
    ip?: string;
    gs?: number;
    games?: number;
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

// statsapi person 응답에서 출신학교 + 드래프트(재지명 중 계약연도=draftYear 건) 추출.
function parseDraftSchool(p: {
  education?: { colleges?: { name?: string }[]; highschools?: { name?: string; state?: string }[] };
  drafts?: { year?: number; pickRound?: string; pickNumber?: number }[];
  draftYear?: number;
}): { school?: string; draft?: string } {
  const college = p.education?.colleges?.[0]?.name;
  const hs = p.education?.highschools?.[0];
  const school = college || (hs?.name ? `${hs.name}${hs.state ? ` (${hs.state})` : ""}` : undefined);
  const drafts = p.drafts ?? [];
  const d = drafts.find((x) => x.year === p.draftYear) ?? drafts[drafts.length - 1];
  const draft = d?.year
    ? `${d.year} 드래프트 ${d.pickRound}R 전체 ${d.pickNumber}픽`
    : p.draftYear
      ? `${p.draftYear} 드래프트`
      : undefined;
  return { school, draft };
}

/** 선수 상세 + 시즌 통계 (한 번에). */
export async function fetchPitcherProfile(
  personId: number,
  season: number,
): Promise<PitcherProfile | null> {
  const { data } = await client.get(`/people/${personId}`, {
    params: {
      hydrate: `stats(group=pitching,type=[season,career],season=${season}),currentTeam,education,draft`,
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
    number: p.primaryNumber,
    height: p.height,
    weight: p.weight,
    debut: p.mlbDebutDate,
    ...parseDraftSchool(p),
  };
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName !== "pitching") continue;
    const s = grp.splits?.[0]?.stat ?? {};
    if (grp?.type?.displayName === "career") {
      profile.career = {
        era: s.era != null ? Number(s.era) : undefined,
        whip: s.whip != null ? Number(s.whip) : undefined,
        so: s.strikeOuts,
        wins: s.wins,
        losses: s.losses,
        ip: s.inningsPitched,
        gs: s.gamesStarted,
        games: s.gamesPlayed,
      };
    } else {
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
  number?: string; // 등번호
  height?: string;
  weight?: number;
  debut?: string; // MLB 데뷔일 YYYY-MM-DD
  draft?: string;
  school?: string;
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
  /** 통산(career) 타격 통계 */
  career?: {
    games?: number;
    avg?: string;
    hr?: number;
    rbi?: number;
    hits?: number;
    ops?: string;
    obp?: string;
    slg?: string;
    sb?: number;
    runs?: number;
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
      hydrate: `stats(group=hitting,type=[season,career],season=${season}),currentTeam,education,draft`,
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
    number: p.primaryNumber,
    height: p.height,
    weight: p.weight,
    debut: p.mlbDebutDate,
    ...parseDraftSchool(p),
  };
  for (const grp of p.stats ?? []) {
    if (grp?.group?.displayName !== "hitting") continue;
    const s = grp.splits?.[0]?.stat ?? {};
    if (grp?.type?.displayName === "career") {
      profile.career = {
        games: s.gamesPlayed,
        avg: s.avg,
        hr: s.homeRuns,
        rbi: s.rbi,
        hits: s.hits,
        ops: s.ops,
        obp: s.obp,
        slg: s.slg,
        sb: s.stolenBases,
        runs: s.runs,
      };
    } else {
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

// ===== MLB 팀 로스터 (MLB Stats API /teams/{id}/roster) — 팀 페이지 선수 명단 =====
//  person.id = MLB Stats id → /players/{id}?league=MLB 선수페이지와 일관(NHL roster 와 동형).
export interface MlbRosterPlayer {
  id: number;
  name: string;
  position: string;
  number: string | null;
  group: "P" | "C" | "IF" | "OF";
}

// MLB Stats team id 는 our 팀(espn id만 보유)과 별개 → teams API 이름매칭. 모듈 캐시.
let mlbTeamIdMap: Map<string, number> | null = null;
async function getMlbStatsTeamId(name: string): Promise<number | null> {
  if (!mlbTeamIdMap) {
    try {
      const r = await fetch(`${BASE_URL}/teams?sportId=1`, { signal: AbortSignal.timeout(10000) });
      const d = (await r.json()) as { teams?: Array<{ id: number; name: string }> };
      mlbTeamIdMap = new Map((d.teams ?? []).map((t) => [t.name.toLowerCase(), t.id]));
    } catch {
      return null;
    }
  }
  return mlbTeamIdMap.get(name.toLowerCase()) ?? null;
}

const mlbPosGroup = (pos: string): "P" | "C" | "IF" | "OF" =>
  pos === "P" || pos === "TWP" ? "P" : pos === "C" ? "C" : ["1B", "2B", "3B", "SS"].includes(pos) ? "IF" : "OF";

export async function fetchMlbRoster(teamName: string): Promise<MlbRosterPlayer[]> {
  const tid = await getMlbStatsTeamId(teamName);
  if (!tid) return [];
  try {
    const r = await fetch(`${BASE_URL}/teams/${tid}/roster`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const d = (await r.json()) as {
      roster?: Array<{ person: { id: number; fullName: string }; position: { abbreviation: string }; jerseyNumber?: string }>;
    };
    return (d.roster ?? []).map((p) => ({
      id: p.person.id,
      name: p.person.fullName,
      position: p.position.abbreviation,
      number: p.jerseyNumber ?? null,
      group: mlbPosGroup(p.position.abbreviation),
    }));
  } catch {
    return [];
  }
}
