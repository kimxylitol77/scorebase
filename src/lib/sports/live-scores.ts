// 모든 리그 통합 라이브 스코어.
//
// 소스 (모두 우리가 결제 중인 유료 API):
//   - API-Football Pro (https://v3.football.api-sports.io)
//       /fixtures?live=all → 우리 12개 축구 리그 한 번에
//   - API-Sports Baseball Pro (https://v1.baseball.api-sports.io)
//       /games?date=YYYY-MM-DD + status 필터 → KBO/NPB/MLB
//   - BALLDONTLIE (https://api.balldontlie.io)
//       /nba/v1/games, /nhl/v1/games → NBA/NHL
//
// 호출 1회로 모든 리그 라이브 매치 정규화. Server-only.

// Edge Runtime 호환을 위해 fetch 사용 (axios 제거).
import { API_FOOTBALL_LEAGUE_ID } from "./api-football-pro";
import { TOURNAMENT_TO_LEAGUE, LOL_TOURNAMENT_IDS } from "./lol";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";

const AF_BASE = "https://v3.football.api-sports.io";
const AB_BASE = "https://v1.baseball.api-sports.io";
const BDL_BASE = "https://api.balldontlie.io";

const TIMEOUT = 8000;

// axios 대체 — AbortController 로 timeout 구현.
async function getJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export interface LiveMatch {
  /** 고유 id (소스 prefix + 외부 id). */
  id: string;
  /** 우리 League 코드 (EPL, KBO, NBA 등). */
  league: string;
  /** 헤더 라벨용 짧은 한글. */
  leagueLabel: string;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  /** "전반 23'", "5회 초", "3쿼터 8:42" 같은 한국어 표기. */
  statusLabel: string;
  /** 정렬용 — 시작 시간 ISO. */
  startTime: string;
  /** 야구 (KBO/NPB/MLB) 만 채워짐 — 이닝별 점수 + H/E/R 카드 미니 보드용. */
  baseball?: {
    /** 1~9 이닝 (+ extra) 점수 — null = 진행 안 됨 */
    homeInnings: (number | null)[];
    awayInnings: (number | null)[];
    homeHits: number | null;
    awayHits: number | null;
    homeErrors: number | null;
    awayErrors: number | null;
  };
  /** LoL/LCK 시리즈 정보 — BALLDONTLIE bo_type + team scores. */
  esports?: {
    bestOf: 3 | 5;
    /** 현재 진행 중인 게임 번호 (1부터). 시리즈가 끝났으면 마지막 게임 번호. */
    currentGame: number;
    series: { home: number; away: number };
  };
}

const LEAGUE_LABEL: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스",
  SERIE_A: "세리에A",
  LIGUE_1: "리그1",
  MLS: "MLS",
  UCL: "UCL",
  WORLD_CUP: "월드컵",
  KBO: "KBO",
  NPB: "NPB",
  MLB: "MLB",
  NBA: "NBA",
  NHL: "NHL",
  LOL: "LCK",
  LCK_CL: "LCK CL",
  LPL: "LPL",
  LEC: "LEC",
  LCS: "LCS",
};

// API-Football fixture league_id → 우리 코드 (역매핑)
const AF_ID_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(API_FOOTBALL_LEAGUE_ID).map(([k, v]) => [v, k]),
);

function shortName(name: string, league?: string): string {
  if (!name) return "";
  // 영문 풀명이면 한글 사전 통과 먼저 (EGYPT_PL "Al Ittihad" → "이티하드 알렉산드리아" → "이티하드")
  const localized = toKoreanTeamName(name, league);
  const display = localized !== name ? localized : name;
  // 한글 약칭은 첫 단어가 곧 약칭 (예: "삼성 라이온즈" → "삼성")
  if (/[가-힣]/.test(display)) {
    const first = display.split(/\s+/)[0];
    return first.length > 4 ? first.slice(0, 4) : first;
  }
  // 영문: 토큰 첫 단어 또는 4 letters
  const tokens = display.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens[0].length <= 4) return tokens[0];
  return display.slice(0, 4);
}

/* ============================================================
 * 축구 — API-Football
 * ==========================================================*/
interface AFFixtureResp {
  errors?: unknown;
  response?: Array<{
    fixture: {
      id: number;
      date: string;
      status: { short: string; elapsed?: number };
    };
    league: { id: number };
    teams: {
      home: { id: number; name: string; logo?: string };
      away: { id: number; name: string; logo?: string };
    };
    goals: { home: number | null; away: number | null };
  }>;
}

function soccerStatusLabel(short: string, elapsed?: number): string {
  switch (short) {
    case "1H":
      return `전반 ${elapsed ?? 0}'`;
    case "2H":
      return `후반 ${elapsed ?? 0}'`;
    case "HT":
      return "HT";
    case "ET":
      return `연장 ${elapsed ?? 0}'`;
    case "BT":
      return "BT";
    case "P":
      return "승부차기";
    case "LIVE":
      return `LIVE ${elapsed ?? 0}'`;
    default:
      return short;
  }
}

export async function fetchSoccerLive(): Promise<LiveMatch[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  try {
    const data = await getJson<AFFixtureResp>(
      `${AF_BASE}/fixtures?live=all`,
      { "x-apisports-key": key },
    );
    return (data.response ?? [])
      .map((f): LiveMatch | null => {
        const code = AF_ID_TO_CODE[f.league.id];
        if (!code) return null; // 우리가 지원하는 12리그 외 제외
        return {
          id: `af-${f.fixture.id}`,
          league: code,
          leagueLabel: LEAGUE_LABEL[code] ?? code,
          homeName: f.teams.home.name,
          awayName: f.teams.away.name,
          homeShort: shortName(f.teams.home.name, code),
          awayShort: shortName(f.teams.away.name, code),
          homeScore: f.goals.home ?? 0,
          awayScore: f.goals.away ?? 0,
          statusLabel: soccerStatusLabel(
            f.fixture.status.short,
            f.fixture.status.elapsed,
          ),
          startTime: f.fixture.date,
        };
      })
      .filter((m): m is LiveMatch => m !== null);
  } catch (e) {
    console.warn("[live-scores/soccer]", (e as Error).message);
    return [];
  }
}

/* ============================================================
 * 야구 (KBO·NPB·MLB) — API-Sports Baseball
 * ==========================================================*/
interface ABGameResp {
  response?: Array<{
    id: number;
    date: string;
    status: { short: string; long: string };
    league: { id: number };
    teams: {
      home: { name: string };
      away: { name: string };
    };
    scores: {
      home: ABSide;
      away: ABSide;
    };
  }>;
}
interface ABSide {
  total: number | null;
  hits?: number | null;
  errors?: number | null;
  innings?: Record<string, number | null>;
}

/** "1"~"9" 키를 순서대로 + extra 배열로 변환 */
function flattenInnings(innings?: Record<string, number | null>): (number | null)[] {
  if (!innings) return [];
  const out: (number | null)[] = [];
  for (let i = 1; i <= 9; i++) out.push(innings[String(i)] ?? null);
  if (innings.extra !== null && innings.extra !== undefined) out.push(innings.extra);
  return out;
}

const BB_LEAGUE_ID_TO_CODE: Record<number, string> = {
  5: "KBO",
  2: "NPB",
  1: "MLB",
};
// 라이브 = NS/POST/FT/CANC 외 (이닝 진행 중) — long 텍스트로 판정
function isBaseballLive(short: string, long: string): boolean {
  if (["FT", "POST", "CANC", "AOT", "PST"].includes(short)) return false;
  if (short === "NS") return false;
  // long 에 "Inning" 또는 "In Play" 포함 시 라이브
  return /Inning|In Play|IP/i.test(long);
}

export function baseballStatusLabel(long: string, short?: string): string {
  // "Top 5th" / "Bottom 5th" → "5회 초" / "5회 말"
  const halfMatch = long.match(/(Top|Bottom)\s+(\d+)(?:st|nd|rd|th)?/i);
  if (halfMatch) {
    const half = halfMatch[1].toLowerCase() === "top" ? "초" : "말";
    return `${halfMatch[2]}회 ${half}`;
  }
  // API-Sports Baseball 패턴: long="Inning 8" → "8회"
  const inning = long.match(/Inning\s+(\d+)/i);
  if (inning) return `${inning[1]}회`;
  // short code "IN8" → "8회" (fallback)
  if (short) {
    const sm = short.match(/^IN(\d+)$/i);
    if (sm) return `${sm[1]}회`;
  }
  if (/half[\s-]?time|interruption|stretch/i.test(long)) return "중단";
  return long || "LIVE";
}

/**
 * 특정 일자(KST yyyy-mm-dd) 의 야구 매치 innings/H/E 만 반환.
 * LIVE/FINISHED 둘 다 포함, NS(시작 전) 제외. /scores 페이지 종료 매치
 * linescore 표시용 보강 데이터 (별도 fetch).
 *
 * Key: api-sports gameId (= 우리 Match.externalId).
 */
export interface BaseballGameDetails {
  homeInnings: (number | null)[];
  awayInnings: (number | null)[];
  homeHits: number | null;
  awayHits: number | null;
  homeErrors: number | null;
  awayErrors: number | null;
  /** 라이브 컨텍스트 — ESPN MLB scoreboard situation 에서 파싱. KBO/NPB 는 미제공. */
  ctx?: {
    inning: number | null;
    half: "top" | "bottom" | null;
    outs: number | null;
    bases: [boolean, boolean, boolean] | null;
    pitcher: string | null;
    batter: string | null;
  };
}

export async function fetchBaseballByDate(
  date: string,
): Promise<Record<string, BaseballGameDetails>> {
  // unstable_cache 가 Map 을 직렬화 못 함 → plain object 로 반환.
  const out: Record<string, BaseballGameDetails> = {};
  const key = process.env.API_BASEBALL_KEY;
  if (!key) return out;
  try {
    const data = await getJson<ABGameResp>(
      `${AB_BASE}/games?date=${date}`,
      { "x-apisports-key": key },
    );
    for (const g of data.response ?? []) {
      const code = BB_LEAGUE_ID_TO_CODE[g.league.id];
      if (!code) continue;
      if (g.status.short === "NS") continue;
      out[String(g.id)] = {
        homeInnings: flattenInnings(g.scores.home.innings),
        awayInnings: flattenInnings(g.scores.away.innings),
        homeHits: g.scores.home.hits ?? null,
        awayHits: g.scores.away.hits ?? null,
        homeErrors: g.scores.home.errors ?? null,
        awayErrors: g.scores.away.errors ?? null,
      };
    }
  } catch (e) {
    console.warn("[live-scores/baseball-by-date]", (e as Error).message);
    // throw 해서 unstable_cache 가 실패 응답을 캐싱하지 않도록 함.
    throw e;
  }
  return out;
}

/**
 * ESPN MLB scoreboard 로부터 일자별 매치 innings/H/E 반환.
 * MLB 는 우리 collector 가 ESPN id 를 externalId 로 쓰므로 api-sports 와
 * 별개 경로. KST yyyy-mm-dd → ESPN yyyymmdd 변환 (단, ESPN 은 UTC 기준이라
 * 동시에 전날도 조회해 합침).
 */
export async function fetchMlbByDate(
  date: string,
): Promise<Record<string, BaseballGameDetails>> {
  const out: Record<string, BaseballGameDetails> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  const ymd = date.replace(/-/g, "");
  // 어제도 같이 조회 — KST 가 UTC 보다 +9h 라 KST 오전 매치가 ESPN 전날에 속함
  const prevYmd = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();
  const fetchOne = async (ymdStr: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${ymdStr}`,
        { signal: ctrl.signal, cache: "no-store" },
      ).finally(() => clearTimeout(t));
      if (!res.ok) return;
      interface EspnComp {
        homeAway: "home" | "away";
        score: string | number;
        hits?: number;
        errors?: number;
        linescores?: Array<{ value?: number; displayValue?: string }>;
      }
      interface EspnSituation {
        balls?: number;
        strikes?: number;
        outs?: number;
        onFirst?: boolean;
        onSecond?: boolean;
        onThird?: boolean;
        pitcher?: { athlete?: { displayName?: string; shortName?: string } };
        batter?: { athlete?: { displayName?: string; shortName?: string } };
      }
      const data = (await res.json()) as {
        events?: Array<{
          id: string;
          competitions?: Array<{
            competitors?: EspnComp[];
            status?: {
              period?: number;
              type?: { name?: string; detail?: string; state?: string };
            };
            situation?: EspnSituation;
          }>;
        }>;
      };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const statusName = comp.status?.type?.name ?? "";
        if (/SCHEDULED|PRE/.test(statusName)) continue; // 시작 전은 skip
        const home = comp.competitors?.find((c) => c.homeAway === "home");
        const away = comp.competitors?.find((c) => c.homeAway === "away");
        if (!home || !away) continue;
        const toInning = (l: { value?: number; displayValue?: string }) =>
          typeof l.value === "number"
            ? l.value
            : l.displayValue !== undefined
              ? Number(l.displayValue)
              : null;
        // 라이브 매치만 ctx 채움 (FINAL/POSTPONED 는 situation 없거나 stale)
        const isLive = comp.status?.type?.state === "in";
        const detail = comp.status?.type?.detail ?? "";
        const halfMatch = detail.match(/^(Top|Bottom|Mid|End)\s+/i);
        const half: "top" | "bottom" | null =
          halfMatch?.[1].toLowerCase() === "top"
            ? "top"
            : halfMatch?.[1].toLowerCase() === "bottom"
              ? "bottom"
              : null;
        const inning = comp.status?.period ?? null;
        const sit = comp.situation;
        const ctx =
          isLive && sit
            ? {
                inning,
                half,
                outs: typeof sit.outs === "number" ? sit.outs : null,
                bases: [
                  !!sit.onFirst,
                  !!sit.onSecond,
                  !!sit.onThird,
                ] as [boolean, boolean, boolean],
                pitcher:
                  sit.pitcher?.athlete?.displayName ??
                  sit.pitcher?.athlete?.shortName ??
                  null,
                batter:
                  sit.batter?.athlete?.displayName ??
                  sit.batter?.athlete?.shortName ??
                  null,
              }
            : undefined;
        out[ev.id] = {
          homeInnings: (home.linescores ?? []).map(toInning),
          awayInnings: (away.linescores ?? []).map(toInning),
          homeHits: home.hits ?? null,
          awayHits: away.hits ?? null,
          homeErrors: home.errors ?? null,
          awayErrors: away.errors ?? null,
          ctx,
        };
      }
    } catch (e) {
      console.warn("[live-scores/mlb-by-date]", (e as Error).message);
      throw e;
    }
  };
  // 한쪽이 빈 응답일 수 있으니 allSettled — 둘 다 실패한 경우에만 throw.
  const results = await Promise.allSettled([fetchOne(ymd), fetchOne(prevYmd)]);
  const allRejected = results.every((r) => r.status === "rejected");
  if (allRejected && Object.keys(out).length === 0) {
    throw new Error("[mlb-by-date] all fetches failed — not caching empty result");
  }
  return out;
}

/* ============================================================
 * NBA/NHL 쿼터/피리어드별 linescore — ESPN scoreboard
 * ==========================================================*/
export interface PeriodLinescore {
  homePeriods: (number | null)[];
  awayPeriods: (number | null)[];
  homeScore: number;
  awayScore: number;
}

/**
 * NBA Ultra (api-sports nba/v2 `/games?id=X`) 응답에서 linescore 추출.
 * 우리 collector 가 Match.raw 에 NBA Ultra games response 저장하므로 외부 fetch 없이 parse.
 * 형식: { scores: { home: { linescore: ["23","23","23","32","14"], points: 115 },
 *                 visitors: { linescore: [...], points: 104 } } }
 * 마지막 element 는 OT (있는 경우만).
 */
export function extractNbaUltraPeriodsFromRaw(rawJson: string | null | undefined): PeriodLinescore | null {
  if (!rawJson) return null;
  try {
    const data = JSON.parse(rawJson) as {
      scores?: {
        home?: { linescore?: string[]; points?: number };
        visitors?: { linescore?: string[]; points?: number };
      };
    };
    const home = data.scores?.home?.linescore;
    const away = data.scores?.visitors?.linescore;
    if (!Array.isArray(home) || !Array.isArray(away)) return null;
    if (home.length === 0 && away.length === 0) return null;
    const toN = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    return {
      homePeriods: home.map(toN),
      awayPeriods: away.map(toN),
      homeScore: data.scores?.home?.points ?? 0,
      awayScore: data.scores?.visitors?.points ?? 0,
    };
  } catch {
    return null;
  }
}

/** sportPath: "basketball/nba" | "hockey/nhl" */
export async function fetchEspnPeriodLinescores(
  sportPath: string,
  date: string,
): Promise<Record<string, PeriodLinescore>> {
  const out: Record<string, PeriodLinescore> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  const ymd = date.replace(/-/g, "");
  const prevYmd = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();
  interface EspnComp {
    homeAway: "home" | "away";
    score: string | number;
    linescores?: Array<{ value?: number; displayValue?: string; period?: number }>;
  }
  const fetchOne = async (ymdStr: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard?dates=${ymdStr}`,
        { signal: ctrl.signal, cache: "no-store" },
      ).finally(() => clearTimeout(t));
      if (!res.ok) return;
      const data = (await res.json()) as {
        events?: Array<{
          id: string;
          competitions?: Array<{
            competitors?: EspnComp[];
            status?: { type?: { name?: string } };
          }>;
        }>;
      };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const status = comp.status?.type?.name ?? "";
        if (/SCHEDULED|PRE/.test(status)) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home");
        const away = comp.competitors?.find((c) => c.homeAway === "away");
        if (!home || !away) continue;
        const toVal = (l: { value?: number; displayValue?: string }) =>
          typeof l.value === "number"
            ? l.value
            : l.displayValue !== undefined
              ? Number(l.displayValue)
              : null;
        out[ev.id] = {
          homePeriods: (home.linescores ?? []).map(toVal),
          awayPeriods: (away.linescores ?? []).map(toVal),
          homeScore: Number(home.score) || 0,
          awayScore: Number(away.score) || 0,
        };
      }
    } catch (e) {
      console.warn("[live-scores/espn-periods]", sportPath, (e as Error).message);
    }
  };
  await Promise.all([fetchOne(ymd), fetchOne(prevYmd)]);
  return out;
}

/* ============================================================
 * NBA/NHL/MLB 매치 detail summary — ESPN summary endpoint.
 * 팀 stats + 양 팀 top scorer + 라이브 승률 (NBA/NHL).
 * sportPath: "basketball/nba" | "hockey/nhl" | "baseball/mlb"
 * ==========================================================*/

export interface MatchTeamStat {
  /** 명칭 (FG%, REB, AST 등) — UI 그대로 표시 */
  label: string;
  /** "39", "10-33", ".397" 등 source 가 준 representation */
  value: string;
  /** 정렬용 raw 숫자 (없으면 -Infinity) */
  raw: number;
}

export interface TeamLeader {
  category: string;
  playerName: string;
  displayValue: string;
}

/** 농구 선수별 박스스코어 한 행. NBA(api-nba v2) / WNBA(api-sports v1) 공통.
    WNBA v1 응답엔 steals/blocks/oreb 가 없어 null 일 수 있음 → UI 에서 "-" 표시. */
export interface BasketballPlayerBox {
  name: string;
  pos?: string | null;
  starter?: boolean;
  /** 출전 시간 — "28:17" 또는 "28" */
  min: string;
  points: number;
  reb: number;
  oreb?: number | null;
  assists: number;
  steals?: number | null;
  blocks?: number | null;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

export interface MatchSummary {
  homeStats: MatchTeamStat[];
  awayStats: MatchTeamStat[];
  homeLeaders: TeamLeader[];
  awayLeaders: TeamLeader[];
  /** ESPN winprobability — 마지막 100개 plays 까지 추출 */
  winProbabilityHome?: number[];
  /** 농구 — 선수별 박스스코어 (NBA/WNBA). 미제공 시 undefined */
  homePlayers?: BasketballPlayerBox[];
  awayPlayers?: BasketballPlayerBox[];
}

interface EspnStatRaw {
  name: string;
  displayName?: string;
  abbreviation?: string;
  displayValue: string;
  value?: number;
}
interface EspnTeamBoxRaw {
  team: { id?: string; abbreviation?: string };
  statistics: EspnStatRaw[];
}
interface EspnLeaderCat {
  name: string;
  displayName: string;
  leaders: Array<{
    displayValue: string;
    athlete?: { displayName?: string; shortName?: string };
  }>;
}
interface EspnTeamLeaderRaw {
  team: { id?: string; abbreviation?: string };
  leaders: EspnLeaderCat[];
}
interface EspnSummaryRaw {
  boxscore?: { teams?: EspnTeamBoxRaw[] };
  leaders?: EspnTeamLeaderRaw[];
  winprobability?: Array<{ homeWinPercentage?: number }>;
  // header.competitions[0].competitors 의 homeAway 로 home/away 정확히 식별
  // (NBA/NHL/MLB 는 boxscore.teams[0]=away 관례지만 soccer 는 [0]=home 인 경우 있음)
  header?: {
    competitions?: Array<{
      competitors?: Array<{
        homeAway: "home" | "away";
        team?: { id?: string };
      }>;
    }>;
  };
}

/** NBA/NHL/MLB 통합 — 팀 stats / leaders / 승률 곡선. */
export async function fetchEspnSummary(
  sportPath: string,
  eventId: string,
  /** ESPN team-level 매핑: stat name 화이트리스트 (UI 표시용) */
  statWhitelist: Array<{ name: string; label: string }>,
): Promise<MatchSummary | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${eventId}`,
      { signal: ctrl.signal, cache: "no-store" },
    ).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const data = (await res.json()) as EspnSummaryRaw;

    const teams = data.boxscore?.teams ?? [];
    const teamLeadersAll = data.leaders ?? [];
    // header.competitions[0].competitors 의 homeAway 로 home/away team.id 식별.
    // (NBA/NHL/MLB 는 boxscore.teams[0]=away, soccer 는 [0]=home 인 경우 있어
    //  index 대신 명시적 homeAway 매칭이 안전 — 예전 MLS 매치에서 home/away
    //  leaders 가 swap 되어 LAFC 선수가 Nashville 자리에 표시되던 버그 fix.)
    const competitors = data.header?.competitions?.[0]?.competitors ?? [];
    const homeTeamId = competitors.find((c) => c.homeAway === "home")?.team?.id;
    const awayTeamId = competitors.find((c) => c.homeAway === "away")?.team?.id;
    const homeBox =
      (homeTeamId && teams.find((t) => t.team?.id === homeTeamId)) ||
      teams[1]; // fallback to legacy NBA/NHL/MLB convention
    const awayBox =
      (awayTeamId && teams.find((t) => t.team?.id === awayTeamId)) ||
      teams[0];

    function pickStats(box: EspnTeamBoxRaw | undefined): MatchTeamStat[] {
      if (!box) return [];
      const out: MatchTeamStat[] = [];
      for (const wl of statWhitelist) {
        const s = box.statistics.find((x) => x.name === wl.name);
        if (!s) continue;
        const raw = s.value ?? Number(s.displayValue.replace(/[^\d.-]/g, ""));
        out.push({
          label: wl.label,
          value: s.displayValue,
          raw: Number.isFinite(raw) ? raw : -Infinity,
        });
      }
      return out;
    }

    function pickLeaders(box: EspnTeamLeaderRaw | undefined): TeamLeader[] {
      if (!box) return [];
      const out: TeamLeader[] = [];
      for (const cat of box.leaders ?? []) {
        // 첫 번째 선수만 (top scorer 등)
        const top = cat.leaders?.[0];
        if (!top) continue;
        // displayName(풀네임)을 한글 매핑 우선 → 매핑 누락 시 shortName 시도 → 그것도 안 되면 영문 그대로
        const fullName = top.athlete?.displayName ?? "";
        const shortNm = top.athlete?.shortName ?? "";
        const koFromFull = fullName ? toKoreanPlayerName(fullName) : "";
        const koFromShort = shortNm ? toKoreanPlayerName(shortNm) : "";
        const name =
          (koFromFull && koFromFull !== fullName ? koFromFull : "") ||
          (koFromShort && koFromShort !== shortNm ? koFromShort : "") ||
          shortNm ||
          fullName ||
          "—";
        out.push({
          category: cat.displayName,
          playerName: name,
          displayValue: top.displayValue,
        });
      }
      return out.slice(0, 4); // 최대 4 카테고리
    }

    return {
      homeStats: pickStats(homeBox),
      awayStats: pickStats(awayBox),
      // teamLeaders 는 [0]=away, [1]=home 보장 안 됨 — team.id 매칭
      homeLeaders: pickLeaders(
        teamLeadersAll.find((l) => l.team.id === homeBox?.team.id),
      ),
      awayLeaders: pickLeaders(
        teamLeadersAll.find((l) => l.team.id === awayBox?.team.id),
      ),
      winProbabilityHome: (data.winprobability ?? [])
        .map((w) => (typeof w.homeWinPercentage === "number" ? w.homeWinPercentage : NaN))
        .filter((n) => Number.isFinite(n))
        // 너무 길면 마지막 100개로 sampling
        .slice(-100),
    };
  } catch (e) {
    console.warn("[live-scores/espn-summary]", sportPath, eventId, (e as Error).message);
    return null;
  }
}

/* ============================================================
 * 축구 골 list — ESPN scoreboard 의 details (scoringPlay)
 * ==========================================================*/
export interface SoccerGoal {
  /** "23'", "45+2'" 등 ESPN clock displayValue */
  minute: string;
  /** "home" | "away" */
  side: "home" | "away";
  player: string;
  ownGoal: boolean;
  penaltyKick: boolean;
}

/** 축구 카드 (옐로/레드) — ESPN scoreboard details 의 yellowCard/redCard / api-football events 의 type="Card" */
export interface SoccerCard {
  minute: string;
  side: "home" | "away";
  player: string;
  /** "yellow" | "red" — second-yellow 는 red 로 표시 */
  kind: "yellow" | "red";
}

/** 축구 팀 통계 한 줄 (점유율·슈팅·코너·카드) — hover tooltip 하단 표시용. */
export interface SoccerTeamStat {
  label: string;
  home: number;
  away: number;
  /** 점유율(%) 행 — 값 뒤 % 표시 */
  pct?: boolean;
}

/**
 * TheSports match cache 의 teamStats (/v1/football/match/team_stats/list 의 stats[])
 * → 표시용 핵심 통계 행. 배열 순서 [0]=home, [1]=away (goals 필드로 교차검증).
 * 양팀 모두 0 인 항목은 숨김 (데이터 없음/무의미).
 */
export function tsTeamStatsToSoccerStats(raw: unknown): SoccerTeamStat[] {
  if (!Array.isArray(raw) || raw.length < 2) return [];
  const h = raw[0] as Record<string, unknown> | null;
  const a = raw[1] as Record<string, unknown> | null;
  if (!h || !a || typeof h !== "object" || typeof a !== "object") return [];
  const out: SoccerTeamStat[] = [];
  const add = (label: string, key: string, pct?: boolean) => {
    const hv = Number(h[key] ?? 0) || 0;
    const av = Number(a[key] ?? 0) || 0;
    if (hv === 0 && av === 0) return;
    out.push({ label, home: hv, away: av, pct });
  };
  add("점유율", "ball_possession", true);
  add("슈팅", "shots");
  add("유효 슈팅", "shots_on_target");
  add("코너킥", "corner_kicks");
  add("옐로카드", "yellow_cards");
  add("레드카드", "red_cards");
  return out;
}

/** halfTeamStats.p1 의 골(stat "1") → 전반전 점수 {home, away}. 데이터 없으면 null. */
export function tsHalfTimeScore(
  halfStats: unknown,
): { home: number; away: number } | null {
  if (!halfStats || typeof halfStats !== "object") return null;
  const p1 = (halfStats as Record<string, unknown>).p1;
  if (!p1 || typeof p1 !== "object") return null;
  const g = (p1 as Record<string, unknown>)["1"];
  if (!Array.isArray(g) || g.length < 2) return null;
  return { home: Number(g[0]) || 0, away: Number(g[1]) || 0 };
}

/** 골 incidents(SoccerGoal[]) 로 전반전 점수 자체 계산 — halfTeamStats 없을 때 fallback.
 *  골 발생 분의 base 가 ≤45 = 전반 (45+추가시간 포함, 46~ 는 후반). */
export function tsHalfScoreFromGoals(
  goals: SoccerGoal[],
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const g of goals) {
    const base = parseInt(g.minute.match(/^(\d+)/)?.[1] ?? "0", 10);
    if (base > 0 && base <= 45) {
      if (g.side === "home") home++;
      else away++;
    }
  }
  return { home, away };
}

/**
 * halfTeamStats(half/team_stats/detail 의 results) 에서 특정 phase 통계 행 추출.
 * phase: p1=전반, p2=후반, ft=풀타임. 구조: { p1: { "25": [home, away], ... }, ... }
 * stat_id 라벨은 검증된 핵심만 (점유율 25 확실, 나머지 SoccerHalfTimeStatsCard 매핑 추정).
 */
export function tsHalfStatsToSoccerStats(
  halfStats: unknown,
  phase: "p1" | "p2" | "ft",
): SoccerTeamStat[] {
  if (!halfStats || typeof halfStats !== "object") return [];
  const obj = (halfStats as Record<string, unknown>)[phase];
  if (!obj || typeof obj !== "object") return [];
  const src = obj as Record<string, unknown>;
  const LABELS: Record<string, string> = {
    "25": "점유율",
    "2": "슈팅",
    "21": "유효 슈팅",
    "4": "코너킥",
    "8": "옐로카드",
    "9": "레드카드",
  };
  const ORDER = ["25", "2", "21", "4", "8", "9"];
  const PCT = new Set(["25"]);
  const out: SoccerTeamStat[] = [];
  for (const id of ORDER) {
    const v = src[id];
    if (!Array.isArray(v) || v.length < 2) continue;
    const h = Number(v[0]) || 0;
    const a = Number(v[1]) || 0;
    if (h === 0 && a === 0) continue;
    out.push({ label: LABELS[id], home: h, away: a, pct: PCT.has(id) });
  }
  return out;
}

/**
 * TheSports match cache 의 detailLive.incidents 배열을 SoccerGoal[] / SoccerCard[] 로 변환.
 *
 * incidents type 코드 (관찰 기반):
 *   1 = 골 (home_score/away_score 변동)
 *   3 = 카드 (reason_type=1 옐로 가정)
 *   4 = 레드 카드 추정 (드물어 미관측 — 보수적으로 score 변동 없는 type=4 만 red)
 *   9 = 교체, 11 = 하프타임, 17 = 다른 골 종류(페널티 추정), 19 = 추가시간
 *
 * 변동 score 있는 incident 는 모두 골로 매핑 (type 무관 — 페널티/own goal 포함 정확).
 * position: 1 = home, 2 = away.
 *
 * ESPN scoreboard 보다 fresh (TheSports MQTT push 기반) + cover 리그 더 넓음
 * (TheSports 가 cover 하는 모든 축구 리그 자동 적용).
 */
export function tsIncidentsToGoals(
  incidents: unknown,
): SoccerGoal[] {
  if (!Array.isArray(incidents)) return [];
  const out: SoccerGoal[] = [];
  for (const raw of incidents) {
    const i = raw as Record<string, unknown>;
    // 골 = home_score 또는 away_score 가 정의된 incident
    const hs = i.home_score;
    const as = i.away_score;
    if (typeof hs !== "number" && typeof as !== "number") continue;
    const side: "home" | "away" = i.position === 1 ? "home" : "away";
    const time = typeof i.time === "number" ? i.time : 0;
    const addTime = typeof i.add_time === "number" ? i.add_time : null;
    const minute = addTime != null ? `${time}+${addTime}'` : `${time}'`;
    out.push({
      minute,
      side,
      player: typeof i.player_name === "string" ? i.player_name : "",
      ownGoal: false, // TheSports 에 own goal flag 없음 — 추후 보강
      penaltyKick: i.type === 17, // 추정 (관찰 기반)
    });
  }
  return out;
}

export function tsIncidentsToCards(
  incidents: unknown,
): SoccerCard[] {
  if (!Array.isArray(incidents)) return [];
  const out: SoccerCard[] = [];
  for (const raw of incidents) {
    const i = raw as Record<string, unknown>;
    if (i.type !== 3 && i.type !== 4) continue;
    const side: "home" | "away" = i.position === 1 ? "home" : "away";
    const time = typeof i.time === "number" ? i.time : 0;
    const addTime = typeof i.add_time === "number" ? i.add_time : null;
    const minute = addTime != null ? `${time}+${addTime}'` : `${time}'`;
    out.push({
      minute,
      side,
      player: typeof i.player_name === "string" ? i.player_name : "",
      kind: i.type === 4 ? "red" : "yellow",
    });
  }
  return out;
}

/**
 * SoccerEvent shape — events 타임라인 카드용. api-football events 의 형식과 호환.
 */
export interface TsFootballScoreParsed {
  /** 정규시간(90분) 점수 */
  regHome: number;
  regAway: number;
  /** 메인 표시 점수 = 연장 포함 (연장 없으면 정규와 동일) */
  mainHome: number;
  mainAway: number;
  /** 승부차기 점수 (승부차기까지 간 경기만, 아니면 null) */
  penHome: number | null;
  penAway: number | null;
}

/**
 * TheSports cache.detailLive.score 를 정규/연장/승부차기로 분해. (축구 전용)
 * score 형식: [match_id, status, home_arr[7], away_arr[7], kickoff, ""]
 *   arr[0]=정규시간, arr[5]=연장(정규 포함 누적), arr[6]=승부차기. 값 -1 = 해당 단계 없음.
 * 예: PSG vs Arsenal UCL 결승 home_arr=[1,0,0,2,11,1,4] away_arr=[1,1,0,4,3,1,3]
 *   = 정규 1-1, 연장 1-1, 승부차기 4-3.
 */
export function parseTsFootballScore(
  detailLive: unknown,
): TsFootballScoreParsed | null {
  const score = (detailLive as { score?: unknown } | null)?.score;
  if (!Array.isArray(score) || score.length < 4) return null;
  const homeArr = score[2];
  const awayArr = score[3];
  if (!Array.isArray(homeArr) || !Array.isArray(awayArr)) return null;
  if (homeArr.length < 7 || awayArr.length < 7) return null;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -1;
  };
  const regHome = num(homeArr[0]);
  const regAway = num(awayArr[0]);
  if (regHome < 0 || regAway < 0) return null;
  const otHome = num(homeArr[5]);
  const otAway = num(awayArr[5]);
  const mainHome = otHome >= regHome ? otHome : regHome;
  const mainAway = otAway >= regAway ? otAway : regAway;
  const penHomeRaw = num(homeArr[6]);
  const penAwayRaw = num(awayArr[6]);
  const hasPen =
    penHomeRaw >= 0 && penAwayRaw >= 0 && (penHomeRaw > 0 || penAwayRaw > 0);
  return {
    regHome,
    regAway,
    mainHome,
    mainAway,
    penHome: hasPen ? penHomeRaw : null,
    penAway: hasPen ? penAwayRaw : null,
  };
}

export interface SoccerEvent {
  minute: number;
  extra: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
  /** TheSports player id (사진 매핑용). incidents 의 player_id (교체는 in_player_id). */
  playerId: string | null;
  /** 어시스트/교체-OUT 선수의 ts player id. */
  assistId: string | null;
}

/**
 * ts cache.detailLive.incidents → SoccerEvent[] (타임라인 카드용).
 *
 * type 매핑 (production 500 cache sample 검증):
 *   1   = 골 (assist1_name) → Normal Goal
 *   17  = 페널티 골 → Penalty
 *   8   = 추가시간 골 (add_time 동반) → Normal Goal
 *   29  = 연장 골 (time>=91) → Extra Time Goal
 *   3   = 옐로 (reason_type=1) → Yellow Card
 *   4   = 레드 (reason_type=9 등) → Red Card
 *   9   = 교체 (in/out_player_name + reason_type) → Substitution
 *   28  = VAR (var_reason + var_result) → VAR
 *   30  = PK shootout → Penalty Shootout
 *   19/11/12/26/27/15/16 = 시각 표시 / 미확정 — skip.
 */
export function tsIncidentsToEvents(incidents: unknown): SoccerEvent[] {
  if (!Array.isArray(incidents)) return [];
  const out: SoccerEvent[] = [];
  for (const raw of incidents) {
    const i = raw as Record<string, unknown>;
    const t = i.type;
    if (typeof t !== "number") continue;
    const time = typeof i.time === "number" ? i.time : 0;
    const extra = typeof i.add_time === "number" ? i.add_time : 0;
    const side: "home" | "away" = i.position === 1 ? "home" : "away";
    const playerName = typeof i.player_name === "string" ? i.player_name : null;
    const playerId = typeof i.player_id === "string" ? i.player_id : null;

    let type: SoccerEvent["type"];
    let detail: string;
    let assistName: string | null = null;
    let assistId: string | null = null;

    if (t === 1) {
      type = "goal";
      detail = "Normal Goal";
      assistName = typeof i.assist1_name === "string" ? i.assist1_name : null;
      assistId = typeof i.assist1_id === "string" ? i.assist1_id : null;
    } else if (t === 17) {
      type = "goal";
      detail = "Penalty";
    } else if (t === 8) {
      type = "goal";
      detail = "Normal Goal";
    } else if (t === 29) {
      type = "goal";
      detail = "Extra Time Goal";
    } else if (t === 3) {
      type = "card";
      detail = "Yellow Card";
    } else if (t === 4) {
      type = "card";
      detail = "Red Card";
    } else if (t === 9) {
      type = "subst";
      // ts 의 교체는 in/out 둘 다 있음 → playerName = in 선수, assistName = out 선수 (api-football 호환)
      const inName = typeof i.in_player_name === "string" ? i.in_player_name : null;
      const outName = typeof i.out_player_name === "string" ? i.out_player_name : null;
      const inId = typeof i.in_player_id === "string" ? i.in_player_id : null;
      const outId = typeof i.out_player_id === "string" ? i.out_player_id : null;
      detail = "Substitution";
      out.push({
        minute: time,
        extra,
        type,
        detail,
        side,
        playerName: inName,
        assistName: outName,
        playerId: inId,
        assistId: outId,
      });
      continue;
    } else if (t === 28) {
      type = "var";
      detail = "VAR";
    } else if (t === 30) {
      type = "goal";
      detail = "Penalty Shootout";
    } else {
      continue; // 19, 11, 12, 26, 27, 15, 16 등 — skip
    }

    out.push({ minute: time, extra, type, detail, side, playerName, assistName, playerId, assistId });
  }
  // 최신 위로 정렬 (extra 포함)
  out.sort((a, b) => (b.minute * 100 + b.extra) - (a.minute * 100 + a.extra));
  return out;
}

/** 우리 League → ESPN soccer league path */
const ESPN_SOCCER_PATH: Record<string, string> = {
  EPL: "eng.1",
  LALIGA: "esp.1",
  BUNDESLIGA: "ger.1",
  SERIE_A: "ita.1",
  LIGUE_1: "fra.1",
  MLS: "usa.1",
  UCL: "uefa.champions",
  WORLD_CUP: "fifa.world",
  K_LEAGUE_1: "kor.1", // ESPN 미커버지만 fallback 시도용 (400 응답이면 빈 결과)
  K_LEAGUE_2: "kor.2",
  J1_LEAGUE: "jpn.1",
  AFC_CL: "afc.champions",
};

/**
 * 일자의 축구 매치별 골 list (LIVE+FINISHED 모두).
 * key = ESPN game id (= 우리 Match.externalId).
 * EPL 은 collector 가 football-data id 라 ESPN 매칭 X → 별도 처리.
 */
/** 축구 골 lookup 용 team-name pair 키 — ESPN id 와 DB externalId 가 다른 케이스
 *  (EPL 등 API-Football fixture id ≠ ESPN event id) 매핑용.
 *  ESPN 과 우리 DB 가 home/away 표기가 서로 다를 수 있으니 sorted 순서로 만들어 양방향 매칭. */
export function soccerGoalsPairKey(teamA: string, teamB: string): string {
  const n = (s: string) => s.toLowerCase().replace(/[\s.·\-_]/g, "");
  const sorted = [n(teamA), n(teamB)].sort();
  return `__name__${sorted[0]}__${sorted[1]}`;
}

/**
 * ESPN soccer scoreboard 에서 home/away 팀명 매칭으로 ESPN event id 찾기.
 *
 * 배경: EPL 은 collector 가 football-data id 를 externalId 로 저장하는데,
 * 그 id 가 ESPN 의 다른 매치 (브라질 세리에A 등) id 와 충돌하는 경우가 있어
 * `fetchEspnSummary(espnPath, gameId)` 호출 시 완전히 다른 매치 데이터를 받음.
 * 이 helper 로 ESPN scoreboard 에서 팀명 매칭해서 진짜 ESPN id 찾고,
 * 그 id 로 summary 호출하면 정확한 데이터.
 *
 * 매칭 실패 (ESPN 에 매치 없음) 시 null → 호출자는 summary fetch skip.
 */
export async function findEspnSoccerEventIdByTeams(
  league: string,
  date: string,
  homeName: string,
  awayName: string,
): Promise<string | null> {
  const path = ESPN_SOCCER_PATH[league];
  if (!path || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ymd = date.replace(/-/g, "");
  const prevYmd = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();
  const norm = (s: string) => s.toLowerCase().replace(/[\s.·\-_]/g, "");
  const hKey = norm(homeName);
  const aKey = norm(awayName);
  for (const ymdStr of [ymd, prevYmd]) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${path}/scoreboard?dates=${ymdStr}`,
        { signal: ctrl.signal, cache: "no-store" },
      ).finally(() => clearTimeout(t));
      if (!res.ok) continue;
      const data = (await res.json()) as {
        events?: Array<{
          id: string;
          competitions?: Array<{
            competitors?: Array<{
              homeAway: "home" | "away";
              team?: { displayName?: string; shortDisplayName?: string };
            }>;
          }>;
        }>;
      };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home")?.team;
        const away = comp.competitors?.find((c) => c.homeAway === "away")?.team;
        const homeN = norm(home?.displayName ?? home?.shortDisplayName ?? "");
        const awayN = norm(away?.displayName ?? away?.shortDisplayName ?? "");
        if (!homeN || !awayN) continue;
        // 양방향 substring 매칭 (DB 와 ESPN 의 팀명 표기 차이 흡수)
        const homeOk = homeN.includes(hKey) || hKey.includes(homeN);
        const awayOk = awayN.includes(aKey) || aKey.includes(awayN);
        if (homeOk && awayOk) return ev.id;
      }
    } catch (e) {
      console.warn("[live-scores/findEspnSoccerEventId]", path, (e as Error).message);
    }
  }
  return null;
}

export async function fetchSoccerGoalsByDate(
  date: string,
  leagues: string[],
): Promise<Record<string, SoccerGoal[]>> {
  const out: Record<string, SoccerGoal[]> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  const ymd = date.replace(/-/g, "");
  const prevYmd = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();
  const paths = leagues
    .map((l) => ESPN_SOCCER_PATH[l])
    .filter((p): p is string => !!p);
  if (paths.length === 0) return out;

  interface EspnSoccerEvent {
    id: string;
    competitions?: Array<{
      competitors?: Array<{
        homeAway: "home" | "away";
        team?: { id?: string; displayName?: string; shortDisplayName?: string };
      }>;
      details?: Array<{
        clock?: { displayValue?: string };
        team?: { id?: string };
        scoringPlay?: boolean;
        ownGoal?: boolean;
        penaltyKick?: boolean;
        athletesInvolved?: Array<{ displayName?: string }>;
      }>;
    }>;
  }

  const fetchOne = async (path: string, ymdStr: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${path}/scoreboard?dates=${ymdStr}`,
        { signal: ctrl.signal, cache: "no-store" },
      ).finally(() => clearTimeout(t));
      if (!res.ok) return;
      const data = (await res.json()) as { events?: EspnSoccerEvent[] };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home");
        const away = comp.competitors?.find((c) => c.homeAway === "away");
        const homeId = home?.team?.id;
        const awayId = away?.team?.id;
        const goals: SoccerGoal[] = [];
        for (const d of comp.details ?? []) {
          if (!d.scoringPlay) continue;
          const teamId = d.team?.id;
          const side: "home" | "away" =
            teamId === homeId ? "home" : teamId === awayId ? "away" : "home";
          // ownGoal 은 상대 팀 득점으로 표시 (ESPN team id 는 실제로 골 넣은 선수 팀)
          const effectiveSide = d.ownGoal ? (side === "home" ? "away" : "home") : side;
          goals.push({
            minute: d.clock?.displayValue ?? "",
            side: effectiveSide,
            player: d.athletesInvolved?.[0]?.displayName ?? "",
            ownGoal: !!d.ownGoal,
            penaltyKick: !!d.penaltyKick,
          });
        }
        if (goals.length > 0) {
          // ESPN event id 키 (1차 매칭) + team-name pair 키 (fallback — DB externalId ≠ ESPN id 인 EPL 등 매핑용)
          out[ev.id] = goals;
          const awayName = away?.team?.displayName ?? away?.team?.shortDisplayName;
          const homeName = home?.team?.displayName ?? home?.team?.shortDisplayName;
          if (awayName && homeName) {
            out[soccerGoalsPairKey(awayName, homeName)] = goals;
          }
        }
      }
    } catch (e) {
      console.warn("[live-scores/soccer-goals]", path, (e as Error).message);
    }
  };

  // 각 리그 × 2일 (선택 일자 + 전날 — KST/UTC 차이 보정) 병렬
  await Promise.all(
    paths.flatMap((p) => [fetchOne(p, ymd), fetchOne(p, prevYmd)]),
  );

  // K_LEAGUE_1/K_LEAGUE_2 — ESPN 미커버 → api-football 로 별도 fetch.
  // /fixtures?date= 로 fixture id list → 각 /fixtures/events 호출 (goal 만 필터).
  const afLeagues = leagues
    .map((l) => ({ code: l, afId: API_FOOTBALL_LEAGUE_ID[l] }))
    .filter((x): x is { code: string; afId: number } =>
      Boolean(x.afId) && (x.code === "K_LEAGUE_1" || x.code === "K_LEAGUE_2"),
    );
  const afKey = process.env.API_FOOTBALL_KEY;
  if (afLeagues.length > 0 && afKey) {
    await Promise.all(
      afLeagues.map(async ({ afId }) => {
        try {
          const year = parseInt(date.slice(0, 4));
          const { fixtures: list } = await fetchAfFixturesAround(
            afId,
            year,
            date,
            afKey,
          );
          await Promise.all(
            list.map(async (fx) => {
              const raws = await fetchAfGoalRawsForFixture(fx.id, afKey);
              if (raws.length === 0) return;
              const goals: SoccerGoal[] = raws.map((r) => ({
                minute: r.minute,
                side: r.teamId === fx.homeId ? "home" : "away",
                player: r.player,
                ownGoal: r.ownGoal,
                penaltyKick: r.penaltyKick,
              }));
              out[String(fx.id)] = goals;
              if (fx.homeName && fx.awayName) {
                out[soccerGoalsPairKey(fx.awayName, fx.homeName)] = goals;
              }
            }),
          );
        } catch (e) {
          console.warn("[live-scores/k-league-goals]", afId, (e as Error).message);
        }
      }),
    );
  }

  return out;
}

/**
 * 일자의 축구 매치별 카드 list (옐로/레드). ESPN scoreboard details 의
 * yellowCard/redCard field 활용. fetchSoccerGoalsByDate 와 같은 endpoint
 * 호출하지만 page.tsx 가 unstable_cache 로 wrap 하므로 ESPN 호출 중복은
 * Next.js fetch dedupe 또는 unstable_cache 가 흡수.
 * K_LEAGUE 등 api-football 리그 카드는 후속 (현재는 ESPN 만).
 */
export async function fetchSoccerCardsByDate(
  date: string,
  leagues: string[],
): Promise<Record<string, SoccerCard[]>> {
  const out: Record<string, SoccerCard[]> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return out;
  const ymd = date.replace(/-/g, "");
  const prevYmd = (() => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  })();
  const paths = leagues
    .map((l) => ESPN_SOCCER_PATH[l])
    .filter((p): p is string => !!p);
  if (paths.length === 0) return out;

  interface EspnSoccerEvent {
    id: string;
    competitions?: Array<{
      competitors?: Array<{
        homeAway: "home" | "away";
        team?: { id?: string; displayName?: string; shortDisplayName?: string };
      }>;
      details?: Array<{
        clock?: { displayValue?: string };
        team?: { id?: string };
        yellowCard?: boolean;
        redCard?: boolean;
        type?: { id?: string; text?: string };
        athletesInvolved?: Array<{ displayName?: string }>;
      }>;
    }>;
  }

  const fetchOne = async (path: string, ymdStr: string) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT);
      const res = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${path}/scoreboard?dates=${ymdStr}`,
        { signal: ctrl.signal, cache: "no-store" },
      ).finally(() => clearTimeout(t));
      if (!res.ok) return;
      const data = (await res.json()) as { events?: EspnSoccerEvent[] };
      for (const ev of data.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        const home = comp.competitors?.find((c) => c.homeAway === "home");
        const away = comp.competitors?.find((c) => c.homeAway === "away");
        const homeId = home?.team?.id;
        const awayId = away?.team?.id;
        const cards: SoccerCard[] = [];
        for (const d of comp.details ?? []) {
          const isYellow =
            !!d.yellowCard || /yellow.*card/i.test(d.type?.text ?? "");
          const isRed =
            !!d.redCard || /red.*card/i.test(d.type?.text ?? "");
          if (!isYellow && !isRed) continue;
          const teamId = d.team?.id;
          const side: "home" | "away" =
            teamId === homeId ? "home" : teamId === awayId ? "away" : "home";
          cards.push({
            minute: d.clock?.displayValue ?? "",
            side,
            player: d.athletesInvolved?.[0]?.displayName ?? "",
            // second yellow → red 로 표시 (UI 단순화)
            kind: isRed ? "red" : "yellow",
          });
        }
        if (cards.length > 0) {
          out[ev.id] = cards;
          const awayName = away?.team?.displayName ?? away?.team?.shortDisplayName;
          const homeName = home?.team?.displayName ?? home?.team?.shortDisplayName;
          if (awayName && homeName) {
            out[soccerGoalsPairKey(awayName, homeName)] = cards;
          }
        }
      }
    } catch (e) {
      console.warn("[live-scores/soccer-cards]", path, (e as Error).message);
    }
  };

  await Promise.all(
    paths.flatMap((p) => [fetchOne(p, ymd), fetchOne(p, prevYmd)]),
  );

  return out;
}

interface AfFixtureLite {
  id: number;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
}

async function fetchAfFixturesAround(
  leagueId: number,
  season: number,
  dateKst: string,
  key: string,
): Promise<{ fixtures: AfFixtureLite[] }> {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const base = new Date(`${dateKst}T00:00:00Z`);
  const prev = new Date(base);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + 1);
  const params = new URLSearchParams({
    league: String(leagueId),
    season: String(season),
    from: ymd(prev),
    to: ymd(next),
  });
  const res = await fetch(`${AF_BASE}/fixtures?${params.toString()}`, {
    headers: { "x-apisports-key": key },
    cache: "no-store",
  });
  if (!res.ok) return { fixtures: [] };
  const data = (await res.json()) as {
    response?: Array<{
      fixture: { id: number };
      teams: { home: { id: number; name: string }; away: { id: number; name: string } };
    }>;
  };
  return {
    fixtures: (data.response ?? []).map((f) => ({
      id: f.fixture.id,
      homeId: f.teams.home.id,
      awayId: f.teams.away.id,
      homeName: f.teams.home.name,
      awayName: f.teams.away.name,
    })),
  };
}

interface AfGoalRaw {
  minute: string;
  teamId: number;
  player: string;
  ownGoal: boolean;
  penaltyKick: boolean;
}

async function fetchAfGoalRawsForFixture(
  fixtureId: number,
  key: string,
): Promise<AfGoalRaw[]> {
  const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixtureId}`, {
    headers: { "x-apisports-key": key },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    response?: Array<{
      time: { elapsed: number; extra?: number | null };
      team: { id: number };
      player: { name?: string };
      type: string;
      detail: string;
    }>;
  };
  return (data.response ?? [])
    .filter((e) => e.type?.toLowerCase() === "goal")
    .map((e) => ({
      minute: `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ""}'`,
      teamId: e.team?.id,
      player: e.player?.name ?? "",
      ownGoal: e.detail === "Own Goal",
      penaltyKick: e.detail === "Penalty",
    }));
}

/**
 * ESPN MLB scoreboard LIVE — TheSports cache 가 stale 한 경우 (Lightsail
 * subscriber 멈춤 등) 의 안전망. MLB collector 가 ESPN id 사용하므로 id 호환.
 */
async function fetchEspnMlbLive(): Promise<LiveMatch[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard",
      { signal: ctrl.signal, headers: { "User-Agent": "scorebase/1.0" } },
    );
    clearTimeout(t);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      events?: Array<{
        id: string;
        date: string;
        status?: { type?: { name?: string; shortDetail?: string } };
        competitions?: Array<{
          competitors?: Array<{
            homeAway?: string;
            team?: { displayName?: string; name?: string; abbreviation?: string };
            score?: string;
          }>;
        }>;
      }>;
    };
    const live: LiveMatch[] = [];
    for (const e of data.events ?? []) {
      const name = e.status?.type?.name ?? "";
      if (name !== "STATUS_IN_PROGRESS" && name !== "STATUS_DELAYED") continue;
      const comp = e.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home?.team || !away?.team) continue;
      const homeName = home.team.displayName ?? home.team.name ?? "?";
      const awayName = away.team.displayName ?? away.team.name ?? "?";
      live.push({
        id: `mlb-${e.id}`, // ESPN id 직접 — Match.externalId 호환
        league: "MLB",
        leagueLabel: LEAGUE_LABEL.MLB ?? "MLB",
        homeName,
        awayName,
        homeShort: home.team.abbreviation ?? shortName(homeName, "MLB"),
        awayShort: away.team.abbreviation ?? shortName(awayName, "MLB"),
        homeScore: parseInt(home.score ?? "0", 10) || 0,
        awayScore: parseInt(away.score ?? "0", 10) || 0,
        // ESPN shortDetail 영어 ("Top 3rd") 를 한국어 이닝 표기로 변환. 없으면 "1회 초" default.
        statusLabel: e.status?.type?.shortDetail
          ? baseballStatusLabel(e.status.type.shortDetail)
          : "1회 초",
        startTime: e.date ?? new Date().toISOString(),
        baseball: undefined,
      });
    }
    return live;
  } catch (e) {
    console.warn("[live-scores/mlb-espn-fallback]", (e as Error).message);
    return [];
  }
}

/**
 * 야구 (KBO/NPB/MLB) 라이브 매치 — TheSports cache 우선 + ESPN MLB fallback.
 *
 * 2026-05-24 변경: api-sports baseball → TheSports cache.
 * - api-sports 가 MLB LIVE status 갱신 안 함 (Not Started 로 stuck) → 0건 응답
 * - TheSports MQTT subscriber + baseball-poller 가 detailLive cache 1-2초 주기 갱신
 * - cache.updatedAt > now - 5분 = 진행 중 매치 (FINISHED 매치는 push 안 옴)
 *
 * 2026-05-24 추가: TheSports cache 가 stale (Lightsail 멈춤 등) 일 때 MLB 만 ESPN
 * scoreboard fallback. KBO/NPB 는 ESPN 미커버라 어쩔 수 없이 cache 기다림.
 *
 * /api/live/baseball/[gameId] 의 cache 우선 전환 (e470fc9) 과 일관.
 */
export async function fetchBaseballLive(): Promise<LiveMatch[]> {
  const { prisma } = await import("@/lib/db");
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 최근 5분 cache push
  try {
    const rows = await prisma.theSportsMatchCache.findMany({
      where: {
        updatedAt: { gte: cutoff },
        match: {
          league: { in: ["KBO", "NPB", "MLB"] },
          // 2026-05-27 fix: POSTPONED 매치가 LIVE 로 표시되는 false positive 회피.
          // worker 가 stale detailLive 를 계속 upsert 해 updatedAt 만 갱신되는 케이스
          // (예: 우천 연기 후에도 cache push 지속) — Match.status 정답에 한정.
          status: "LIVE",
        },
      },
      include: {
        match: {
          select: {
            externalId: true,
            league: true,
            startTime: true,
            homeScore: true,
            awayScore: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
      take: 50,
    });

    return rows.map((c): LiveMatch => {
      const m = c.match;
      const dl = c.detailLive as
        | {
            score?: [string, number, number, Record<string, unknown>];
            extra?: { good?: number; bad?: number; base?: string; out?: number };
          }
        | null;
      const scoreArr = dl?.score;
      const scoreObj =
        Array.isArray(scoreArr) && scoreArr.length >= 4
          ? (scoreArr[3] as Record<string, [string, string] | undefined>)
          : null;

      // 점수 — cache.ft 우선, 없으면 DB
      let homeScore = m.homeScore ?? 0;
      let awayScore = m.awayScore ?? 0;
      const ft = scoreObj?.ft;
      if (Array.isArray(ft) && ft.length === 2) {
        const h = parseInt(ft[0], 10);
        const a = parseInt(ft[1], 10);
        if (Number.isFinite(h)) homeScore = h;
        if (Number.isFinite(a)) awayScore = a;
      }

      // 이닝별 — pN 추출
      const homeInnings: (number | null)[] = [];
      const awayInnings: (number | null)[] = [];
      let maxInning = 0;
      if (scoreObj) {
        for (let i = 1; i <= 20; i++) {
          const p = scoreObj[`p${i}`];
          if (!p) continue;
          maxInning = i;
          homeInnings.push(p[0] === "X" || !p[0] ? null : parseInt(p[0], 10));
          awayInnings.push(p[1] === "X" || !p[1] ? null : parseInt(p[1], 10));
        }
      }

      // statusLabel — 이닝 + half (score[2] 1=초, 2=말)
      // 매치 시작 직후 (cache 에 이닝 데이터 아직 push 안 옴) 에도 "LIVE" 대신
      // 이닝 표기로 통일 — half 정보 있으면 그대로, 없으면 "1회 초" 로 추정 (시작 직후 가정).
      const halfTopBot = Array.isArray(scoreArr) ? scoreArr[2] : null;
      const halfKo = halfTopBot === 2 ? "말" : halfTopBot === 1 ? "초" : "";
      const statusLabel =
        maxInning > 0
          ? `${maxInning}회 ${halfKo}`.trim()
          : `1회 ${halfKo || "초"}`;

      // hits / errors
      const hitsHome = scoreObj?.h?.[0] ? parseInt(scoreObj.h[0], 10) : null;
      const hitsAway = scoreObj?.h?.[1] ? parseInt(scoreObj.h[1], 10) : null;
      const errHome = scoreObj?.e?.[0] ? parseInt(scoreObj.e[0], 10) : null;
      const errAway = scoreObj?.e?.[1] ? parseInt(scoreObj.e[1], 10) : null;

      const code = m.league as "KBO" | "NPB" | "MLB";

      return {
        id: `ab-${m.externalId}`, // 기존 prefix 유지 (페이지 매칭 호환)
        league: code,
        leagueLabel: LEAGUE_LABEL[code] ?? code,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        homeShort: shortName(m.homeTeam.name, code),
        awayShort: shortName(m.awayTeam.name, code),
        homeScore,
        awayScore,
        statusLabel,
        startTime: m.startTime.toISOString(),
        baseball: {
          homeInnings: maxInning > 0 ? homeInnings : [],
          awayInnings: maxInning > 0 ? awayInnings : [],
          homeHits: Number.isFinite(hitsHome) ? hitsHome : null,
          awayHits: Number.isFinite(hitsAway) ? hitsAway : null,
          homeErrors: Number.isFinite(errHome) ? errHome : null,
          awayErrors: Number.isFinite(errAway) ? errAway : null,
        },
      };
    });
  } catch (e) {
    console.warn("[live-scores/baseball-ts]", (e as Error).message);
    return [];
  }
}

/* ============================================================
 * NBA / NHL — BALLDONTLIE
 * ==========================================================*/
interface BdlNbaGame {
  id: number;
  date: string;
  status: string; // "Final" | "Live" | "Scheduled" | "HH:MM"
  period: number | null;
  time: string | null;
  home_team_score: number;
  visitor_team_score: number;
  home_team: { abbreviation: string; full_name: string };
  visitor_team: { abbreviation: string; full_name: string };
}
interface BdlNhlGame {
  id: number;
  game_date: string;
  start_time_utc: string;
  game_state: string; // "FUT" / "LIVE" / "FINAL" / "OFF" 등
  time_remaining: string | null;
  period: number | null;
  home_score: number;
  away_score: number;
  home_team: { tricode: string; full_name: string };
  away_team: { tricode: string; full_name: string };
}

function isNbaLive(g: BdlNbaGame): boolean {
  if (g.status === "Final" || g.status === "Scheduled") return false;
  if (g.status === "Live") return true;
  return (g.period ?? 0) >= 1 && g.status !== "Final";
}

function isNhlLive(g: BdlNhlGame): boolean {
  return g.game_state === "LIVE" || g.game_state === "CRIT";
}

function bdlBuildDates(): URLSearchParams {
  const now = new Date();
  const dates = [
    new Date(now.getTime() - 86400 * 1000).toISOString().slice(0, 10),
    now.toISOString().slice(0, 10),
  ];
  const params = new URLSearchParams();
  for (const d of dates) params.append("dates[]", d);
  return params;
}

export async function fetchNbaLive(): Promise<LiveMatch[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  try {
    const data = await getJson<{ data?: BdlNbaGame[] }>(
      `${BDL_BASE}/nba/v1/games?${bdlBuildDates().toString()}`,
      { Authorization: key },
    );
    return (data.data ?? [])
      .filter(isNbaLive)
      .map(
        (g): LiveMatch => ({
          id: `bdlnba-${g.id}`,
          league: "NBA",
          leagueLabel: LEAGUE_LABEL.NBA,
          homeName: g.home_team.full_name,
          awayName: g.visitor_team.full_name,
          homeShort: g.home_team.abbreviation,
          awayShort: g.visitor_team.abbreviation,
          homeScore: g.home_team_score,
          awayScore: g.visitor_team_score,
          statusLabel:
            (g.period ?? 0) === 0
              ? "LIVE"
              : g.time
                ? `${g.period}Q ${g.time}`
                : `${g.period}Q`,
          startTime: g.date,
        }),
      );
  } catch (e) {
    console.warn("[live-scores/nba]", (e as Error).message);
    return [];
  }
}

export async function fetchNhlLive(): Promise<LiveMatch[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  try {
    const data = await getJson<{ data?: BdlNhlGame[] }>(
      `${BDL_BASE}/nhl/v1/games?${bdlBuildDates().toString()}`,
      { Authorization: key },
    );
    return (data.data ?? [])
      .filter(isNhlLive)
      .map(
        (g): LiveMatch => ({
          id: `bdlnhl-${g.id}`,
          league: "NHL",
          leagueLabel: LEAGUE_LABEL.NHL,
          homeName: g.home_team.full_name,
          awayName: g.away_team.full_name,
          homeShort: g.home_team.tricode,
          awayShort: g.away_team.tricode,
          homeScore: g.home_score,
          awayScore: g.away_score,
          statusLabel:
            (g.period ?? 0) === 0
              ? "LIVE"
              : g.time_remaining
                ? `${g.period}P ${g.time_remaining}`
                : `${g.period}P`,
          startTime: g.start_time_utc,
        }),
      );
  } catch (e) {
    console.warn("[live-scores/nhl]", (e as Error).message);
    return [];
  }
}

/* ============================================================
 * LoL / LCK — BALLDONTLIE /lol/v1/matches
 * ==========================================================*/
interface BdlLolMatch {
  id: number;
  tournament: { id: number; name: string };
  team1: { id: number; name: string } | null;
  team2: { id: number; name: string } | null;
  team1_score: number;
  team2_score: number;
  bo_type: number; // 3 or 5
  status: string; // "upcoming" | "current" | "finished"
  start_date: string;
}

function lolStatusLabel(match: BdlLolMatch): string {
  const t = match.team1_score + match.team2_score;
  return `${t + 1}게임`;
}

// LOL 라이브 — 전 리그(LCK 본선·2군 + 해외 LPL/LEC/LCS) tournament 를 한 번에 폴링.
// tournament → league 매핑은 lol.ts 단일 소스. 해외 리그는 표준시 차이로 매치 날짜가
// 어제/내일 KST 에 걸칠 수 있어 ±1일 window 로 조회한 뒤 status="current" 만 라이브로 채택.
export async function fetchLolLive(): Promise<LiveMatch[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const ymd = (offsetDays: number) =>
    new Date(kstNow.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
  const dateQs = [-1, 0, 1].map((o) => `dates[]=${ymd(o)}`).join("&");
  const tourQs = LOL_TOURNAMENT_IDS.map((id) => `tournament_ids[]=${id}`).join("&");
  try {
    const data = await getJson<{ data?: BdlLolMatch[] }>(
      `${BDL_BASE}/lol/v1/matches?${dateQs}&${tourQs}&per_page=100`,
      { Authorization: key },
    );
    return (data.data ?? [])
      // 미정(TBD) 팀은 name=null 로 오므로 제외.
      .filter((m) => m.status === "current" && m.team1?.name && m.team2?.name)
      .map((m): LiveMatch => {
        // tournament → league (lol.ts 단일 소스). 미매핑은 LCK 본선("LOL") fallback.
        const league = TOURNAMENT_TO_LEAGUE[m.tournament?.id] ?? "LOL";
        // BALLDONTLIE team1 = home, team2 = away (DB 매칭 검증 완료)
        const bestOf: 3 | 5 = m.bo_type === 5 ? 5 : 3;
        const totalGames = m.team1_score + m.team2_score;
        return {
          id: `bdllol-${m.id}`,
          league,
          leagueLabel: LEAGUE_LABEL[league] ?? league,
          homeName: m.team1!.name,
          awayName: m.team2!.name,
          homeShort: m.team1!.name.slice(0, 4),
          awayShort: m.team2!.name.slice(0, 4),
          homeScore: m.team1_score,
          awayScore: m.team2_score,
          statusLabel: lolStatusLabel(m),
          startTime: m.start_date,
          esports: {
            bestOf,
            currentGame: totalGames + 1,
            series: { home: m.team1_score, away: m.team2_score },
          },
        };
      });
  } catch (e) {
    console.warn("[live-scores/lol]", (e as Error).message);
    return [];
  }
}

/* ============================================================
 * 통합 — 모든 소스 병렬 fetch + 정렬
 * ==========================================================*/
export async function fetchAllLiveScores(): Promise<LiveMatch[]> {
  const [soccer, baseball, nba, nhl, lol] = await Promise.all([
    fetchSoccerLive(),
    fetchBaseballLive(),
    fetchNbaLive(),
    fetchNhlLive(),
    fetchLolLive(),
  ]);
  const all = [...soccer, ...baseball, ...nba, ...nhl, ...lol];
  // 정렬 — 가장 최근 시작 매치 우선
  all.sort((a, b) => b.startTime.localeCompare(a.startTime));
  return all;
}
