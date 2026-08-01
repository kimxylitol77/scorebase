// 야구 경기 전 분석 — 팀/선수 시즌 성적 읽기 헬퍼 (SSR).
// BaseballTeamSeasonStats / BaseballPlayerSeasonStats (cron 적재) 를 매치의 양 팀에 join.
//
// JOIN 전략 (2026-06-02 실측):
//   - season.teamName = 정규화 한글명.
//   - MLB: toKoreanTeamName(Team.name) 와 정확히 일치 ("Tampa Bay Rays"→"탬파베이").
//   - KBO/NPB: season.teamName("LG","한신")이 Team.name("LG 트윈스","한신 타이거스")의 부분문자열.
//   - league 필터로 동명(롯데=KBO/NPB) 구분.

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { NATIONAL_TEAM_LEAGUES } from "@/lib/sports/fifa-rankings";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export interface BaseballTeamSeason {
  teamName: string;
  wins: number;
  losses: number;
  games: number;
  avg: number | null;
  ops: number | null;
  homeRuns: number | null;
  stolenBases: number | null;
  runs: number | null;
  era: number | null;
  whip: number | null;
}

export interface BaseballBatter {
  playerName: string;
  playerNameEn: string | null;
  externalId: string | null;
  avg: number | null;
  hits: number | null;
  rbi: number | null;
  ops: number | null;
  homeRuns: number | null;
  games: number | null;
}

export interface BaseballSeasonAnalysis {
  home: { team: BaseballTeamSeason | null; batters: BaseballBatter[] };
  away: { team: BaseballTeamSeason | null; batters: BaseballBatter[] };
  /** 양 팀 중 하나라도 시즌 stats 매칭됐는지 — false 면 섹션 렌더 skip. */
  hasData: boolean;
}

const BASEBALL_LEAGUES = new Set(["MLB", "KBO", "NPB"]);
const MAX_BATTERS = 13;

type TeamRow = Awaited<
  ReturnType<typeof prisma.baseballTeamSeasonStats.findMany>
>[number];

/** 매치 팀명 → season 테이블 row 매칭. MLB 정규화 일치 → KBO/NPB 부분문자열 순. */
function matchTeam(rows: TeamRow[], dbTeamName: string): TeamRow | null {
  const ko = toKoreanTeamName(dbTeamName) || dbTeamName;
  // 1) 정규화 정확 일치 (MLB)
  const exact = rows.find((r) => r.teamName === ko);
  if (exact) return exact;
  // 2) Team.name 이 season.teamName 을 포함 (KBO/NPB: "LG" ⊂ "LG 트윈스")
  const contains = rows.find(
    (r) => ko.includes(r.teamName) || dbTeamName.includes(r.teamName),
  );
  if (contains) return contains;
  // 3) 역방향 (드묾)
  return rows.find((r) => r.teamName.includes(ko)) ?? null;
}

function toTeam(r: TeamRow): BaseballTeamSeason {
  return {
    teamName: r.teamName,
    wins: r.wins,
    losses: r.losses,
    games: r.games,
    avg: r.avg,
    ops: r.ops,
    homeRuns: r.homeRuns,
    stolenBases: r.stolenBases,
    runs: r.runs,
    era: r.era,
    whip: r.whip,
  };
}

async function loadBatters(
  league: string,
  season: string,
  teamName: string,
): Promise<BaseballBatter[]> {
  const rows = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league, season, teamName },
    orderBy: [{ hits: "desc" }, { rbi: "desc" }],
    take: MAX_BATTERS,
  });
  return rows.map((r) => ({
    playerName: r.playerName,
    playerNameEn: r.playerNameEn,
    externalId: r.externalId,
    avg: r.avg,
    hits: r.hits,
    rbi: r.rbi,
    ops: r.ops,
    homeRuns: r.homeRuns,
    games: r.games,
  }));
}

/** 매치(야구)의 경기 전 팀/선수 시즌 분석. 비야구·데이터 없음·DB 에러 시 null. */
export async function getBaseballSeasonAnalysis(match: {
  league: string;
  startTime: Date;
  homeTeam: { name: string };
  awayTeam: { name: string };
}): Promise<BaseballSeasonAnalysis | null> {
  if (!BASEBALL_LEAGUES.has(match.league)) return null;
  try {
    const season = String(match.startTime.getUTCFullYear());
    const teamRows = await prisma.baseballTeamSeasonStats.findMany({
      where: { league: match.league, season },
    });
    if (teamRows.length === 0) return null;

    const homeRow = matchTeam(teamRows, match.homeTeam.name);
    const awayRow = matchTeam(teamRows, match.awayTeam.name);
    if (!homeRow && !awayRow) return null;

    const [homeBatters, awayBatters] = await Promise.all([
      homeRow ? loadBatters(match.league, season, homeRow.teamName) : Promise.resolve([]),
      awayRow ? loadBatters(match.league, season, awayRow.teamName) : Promise.resolve([]),
    ]);

    return {
      home: { team: homeRow ? toTeam(homeRow) : null, batters: homeBatters },
      away: { team: awayRow ? toTeam(awayRow) : null, batters: awayBatters },
      hasData: true,
    };
  } catch {
    return null;
  }
}

/* ============================================================
 * ③ 최근 경기 / ④ 상대전적 — Match 테이블 기반
 * ==========================================================*/

export interface BaseballGameRow {
  date: string; // "YY.MM.DD" (KST)
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: "HOME" | "AWAY" | "DRAW" | null;
  /** 현재 보는 대회와 다른 대회의 경기일 때만 대회명 라벨 (A매치 크로스 대회 표시). */
  leagueLabel?: string;
}

export interface BaseballRecentGames {
  home: BaseballGameRow[];
  away: BaseballGameRow[];
  h2h: BaseballGameRow[];
  hasData: boolean;
}

interface RawGame {
  league: string;
  startTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

const GAME_SELECT = {
  league: true,
  startTime: true,
  homeScore: true,
  awayScore: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
};

function kstYYMMDD(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const yy = String(k.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  return `${yy}.${mm}.${dd}`;
}

function toGameRow(m: RawGame, league: string): BaseballGameRow {
  const hs = m.homeScore;
  const as = m.awayScore;
  let winner: BaseballGameRow["winner"] = null;
  if (hs != null && as != null) winner = hs > as ? "HOME" : hs < as ? "AWAY" : "DRAW";
  return {
    date: kstYYMMDD(m.startTime),
    homeName: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
    awayName: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
    homeScore: hs,
    awayScore: as,
    winner,
    ...(m.league !== league
      ? { leagueLabel: LEAGUE_DISPLAY[m.league] ?? m.league }
      : {}),
  };
}

/** 양 팀 각자 최근 경기 + 두 팀 상대전적(H2H) — 각 최대 RECENT_TAKE 경기.
 *  UI 는 5개씩 노출 + "더 많은 경기 보기" 로 확장. 데이터 없음·DB 에러 시 null. */
const RECENT_TAKE = 30;

export async function getBaseballRecentGames(match: {
  league: string;
  startTime: Date;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
}): Promise<BaseballRecentGames | null> {
  // 전 종목 공통 (Match 기반) — 야구 게이트 없음. 무승부는 toGameRow 가 처리. 에러 시 null.
  try {
    const before = match.startTime;
    // A매치(시니어 국가대항)는 같은 팀이 여러 대회를 오가므로 현재 대회로 좁히면 폼이 안 잡힌다
    // (ASEAN_CHAMP 만 보면 친선·예선 경기 누락). 국가대항 대회 전체로 확장 — teamId 기준
    // 조회라 다른 나라·연령대 경기가 섞일 일은 없다. 클럽 리그는 기존대로 현재 리그만.
    const leagueFilter = NATIONAL_TEAM_LEAGUES.has(match.league)
      ? { league: { in: [...NATIONAL_TEAM_LEAGUES] } }
      : { league: match.league };
    const base = {
      ...leagueFilter,
      status: "FINISHED",
      startTime: { lt: before },
    };
    const [homeRows, awayRows, h2hRows] = await Promise.all([
      prisma.match.findMany({
        where: { ...base, OR: [{ homeTeamId: match.homeTeam.id }, { awayTeamId: match.homeTeam.id }] },
        orderBy: { startTime: "desc" },
        take: RECENT_TAKE,
        select: GAME_SELECT,
      }),
      prisma.match.findMany({
        where: { ...base, OR: [{ homeTeamId: match.awayTeam.id }, { awayTeamId: match.awayTeam.id }] },
        orderBy: { startTime: "desc" },
        take: RECENT_TAKE,
        select: GAME_SELECT,
      }),
      prisma.match.findMany({
        where: {
          ...base,
          OR: [
            { homeTeamId: match.homeTeam.id, awayTeamId: match.awayTeam.id },
            { homeTeamId: match.awayTeam.id, awayTeamId: match.homeTeam.id },
          ],
        },
        orderBy: { startTime: "desc" },
        take: RECENT_TAKE,
        select: GAME_SELECT,
      }),
    ]);
    const home = homeRows.map((m) => toGameRow(m, match.league));
    const away = awayRows.map((m) => toGameRow(m, match.league));
    const h2h = h2hRows.map((m) => toGameRow(m, match.league));
    if (!home.length && !away.length && !h2h.length) return null;
    return { home, away, h2h, hasData: true };
  } catch {
    return null;
  }
}
