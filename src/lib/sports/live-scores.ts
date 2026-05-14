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

import axios from "axios";
import { API_FOOTBALL_LEAGUE_ID } from "./api-football-pro";

const AF_BASE = "https://v3.football.api-sports.io";
const AB_BASE = "https://v1.baseball.api-sports.io";
const BDL_BASE = "https://api.balldontlie.io";

const TIMEOUT = 8000;

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
};

// API-Football fixture league_id → 우리 코드 (역매핑)
const AF_ID_TO_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(API_FOOTBALL_LEAGUE_ID).map(([k, v]) => [v, k]),
);

function shortName(name: string): string {
  // 영문 풀명 → 약칭 (첫 단어 또는 처음 3글자)
  if (!name) return "";
  // 한글 약칭은 보통 첫 단어가 곧 약칭 (예: "삼성 라이온즈" → "삼성")
  if (/[가-힣]/.test(name)) {
    const first = name.split(/\s+/)[0];
    return first.length > 4 ? first.slice(0, 4) : first;
  }
  // 영문: 토큰 첫 단어 또는 3 letters
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens[0].length <= 4) return tokens[0];
  return name.slice(0, 4);
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
    const { data } = await axios.get<AFFixtureResp>(`${AF_BASE}/fixtures`, {
      params: { live: "all" },
      headers: { "x-apisports-key": key },
      timeout: TIMEOUT,
    });
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
          homeShort: shortName(f.teams.home.name),
          awayShort: shortName(f.teams.away.name),
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
      home: { total: number | null };
      away: { total: number | null };
    };
  }>;
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

function baseballStatusLabel(long: string, short?: string): string {
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

export async function fetchBaseballLive(): Promise<LiveMatch[]> {
  const key = process.env.API_BASEBALL_KEY;
  if (!key) return [];
  // KST 기준 "오늘" 매치. UTC 자정에 걸쳐 KST 일자가 바뀌므로 KST 날짜 직접.
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const yyyy = kstNow.getUTCFullYear();
  const mm = String(kstNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kstNow.getUTCDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;
  try {
    const { data } = await axios.get<ABGameResp>(`${AB_BASE}/games`, {
      params: { date },
      headers: { "x-apisports-key": key },
      timeout: TIMEOUT,
    });
    return (data.response ?? [])
      .map((g): LiveMatch | null => {
        const code = BB_LEAGUE_ID_TO_CODE[g.league.id];
        if (!code) return null;
        if (!isBaseballLive(g.status.short, g.status.long)) return null;
        return {
          id: `ab-${g.id}`,
          league: code,
          leagueLabel: LEAGUE_LABEL[code] ?? code,
          homeName: g.teams.home.name,
          awayName: g.teams.away.name,
          homeShort: shortName(g.teams.home.name),
          awayShort: shortName(g.teams.away.name),
          homeScore: g.scores.home.total ?? 0,
          awayScore: g.scores.away.total ?? 0,
          statusLabel: baseballStatusLabel(g.status.long, g.status.short),
          startTime: g.date,
        };
      })
      .filter((m): m is LiveMatch => m !== null);
  } catch (e) {
    console.warn("[live-scores/baseball]", (e as Error).message);
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
    const { data } = await axios.get<{ data?: BdlNbaGame[] }>(
      `${BDL_BASE}/nba/v1/games?${bdlBuildDates().toString()}`,
      { headers: { Authorization: key }, timeout: TIMEOUT },
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
    const { data } = await axios.get<{ data?: BdlNhlGame[] }>(
      `${BDL_BASE}/nhl/v1/games?${bdlBuildDates().toString()}`,
      { headers: { Authorization: key }, timeout: TIMEOUT },
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
 * 통합 — 모든 소스 병렬 fetch + 정렬
 * ==========================================================*/
export async function fetchAllLiveScores(): Promise<LiveMatch[]> {
  const [soccer, baseball, nba, nhl] = await Promise.all([
    fetchSoccerLive(),
    fetchBaseballLive(),
    fetchNbaLive(),
    fetchNhlLive(),
  ]);
  const all = [...soccer, ...baseball, ...nba, ...nhl];
  // 정렬 — 가장 최근 시작 매치 우선
  all.sort((a, b) => b.startTime.localeCompare(a.startTime));
  return all;
}
