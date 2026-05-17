// /live/* 라이브 페이지 공통 데이터 fetcher.
// 한 번의 SSR 호출로 H2H · 양 팀 시즌 standings · preview/recap article slug 모두 반환.

import { prisma } from "@/lib/db";
import { calcStandings, type StandingSummary } from "@/lib/predict/standings";
import { calcForm, type TeamForm } from "@/lib/predict/form";
import type { PredictMatch, FormResult } from "@/lib/predict/types";

export interface H2HResult {
  /** 직전 매치부터 과거 순. 'home' 관점 결과 (호출 시 perspectiveTeamId 기준) */
  results: FormResult[];
  wins: number;
  draws: number;
  losses: number;
}

export interface StandingLite {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  position: number;
}

export interface MatchExtras {
  homeForm: TeamForm;
  awayForm: TeamForm;
  homeStanding: StandingLite | null;
  awayStanding: StandingLite | null;
  totalTeams: number;
  /** 양 팀 직접 맞대결 결과 — home 팀 관점 */
  h2hHome: H2HResult;
  previewSlug: string | null;
  recapSlug: string | null;
}

const H2H_MAX = 5;
const FORM_DAYS = 60;

// 유럽 축구 — 8월 시작 ~ 다음 해 5월 종료 시즌.
const EUROPEAN_SOCCER_LEAGUES = new Set([
  "EPL", "LALIGA", "LALIGA_2", "BUNDESLIGA", "BUNDESLIGA_2",
  "SERIE_A", "SERIE_B", "LIGUE_1", "LIGUE_2",
  "UCL", "UEL", "UECL", "CHAMPIONSHIP",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
]);

/**
 * 리그별 정확한 시즌 시작 날짜 계산.
 *
 * - 유럽 축구: 8월 1일 시작 (예: 2025-26 시즌 = 2025-08-01 ~ 2026-05-31).
 *   match.startTime 이 8월 이전(1~7월)이면 작년 8월이 시즌 시작.
 * - NBA/NHL: 10월 1일 시작 (예: 2025-26 시즌 = 2025-10-01 ~ 2026-06-30).
 *   1~9월이면 작년 10월이 시즌 시작.
 * - 그 외 (KBO/NPB/MLB/K_LEAGUE/J_LEAGUE/MLS/AFC_CL/LOL/WORLD_CUP):
 *   1년 단위 → 1월 1일.
 *
 * 이전엔 모든 리그가 1월 1일로 하드코딩되어 유럽 축구의 시즌 후반(1~5월) 매치만
 * standings 에 반영되던 버그 (예: EPL 맨유 실제 3위인데 페이지에 2위로 표시).
 */
function seasonStartFor(league: string, refDate: Date): Date {
  const y = refDate.getUTCFullYear();
  const m = refDate.getUTCMonth(); // 0=Jan
  if (EUROPEAN_SOCCER_LEAGUES.has(league)) {
    const startYear = m >= 7 ? y : y - 1; // 8월(idx 7) 이후면 올해
    return new Date(Date.UTC(startYear, 7, 1));
  }
  if (league === "NBA" || league === "NHL") {
    const startYear = m >= 9 ? y : y - 1; // 10월(idx 9) 이후면 올해
    return new Date(Date.UTC(startYear, 9, 1));
  }
  return new Date(Date.UTC(y, 0, 1));
}

/** 매치 추가 데이터 (폼/standings/H2H/article slug).
 *  DB 연결 실패 (P1001 등) 시 모든 필드 비어있는 fallback 반환 — dev 환경 에러 오버레이 방지. */
export async function fetchMatchExtras(match: {
  id: number;
  league: string;
  startTime: Date;
  homeTeam: { id: number };
  awayTeam: { id: number };
}): Promise<MatchExtras> {
  try {
    return await fetchMatchExtrasInner(match);
  } catch {
    const emptyForm = { results: [], wins: 0, draws: 0, losses: 0 };
    return {
      homeForm: emptyForm,
      awayForm: emptyForm,
      homeStanding: null,
      awayStanding: null,
      totalTeams: 0,
      h2hHome: { results: [], wins: 0, draws: 0, losses: 0 },
      previewSlug: null,
      recapSlug: null,
    };
  }
}

async function fetchMatchExtrasInner(match: {
  id: number;
  league: string;
  startTime: Date;
  homeTeam: { id: number };
  awayTeam: { id: number };
}): Promise<MatchExtras> {
  const since = new Date(match.startTime.getTime() - FORM_DAYS * 24 * 3600 * 1000);
  // 시즌 standings 는 같은 시즌 모든 매치 필요 — 리그별 정확한 시즌 시작 적용.
  const seasonStart = seasonStartFor(match.league, match.startTime);

  const [recentForForm, allSeason, h2hMatches, articles] = await Promise.all([
    // 폼 — 양 팀 최근 60일 매치
    prisma.match.findMany({
      where: {
        league: match.league,
        status: "FINISHED",
        startTime: { gte: since, lt: match.startTime },
        OR: [
          { homeTeamId: match.homeTeam.id },
          { awayTeamId: match.homeTeam.id },
          { homeTeamId: match.awayTeam.id },
          { awayTeamId: match.awayTeam.id },
        ],
      },
      select: {
        id: true, league: true,
        homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true,
        startTime: true, status: true,
      },
      orderBy: { startTime: "desc" },
      take: 60,
    }),
    // 시즌 전체 — standings 계산용 (점수만 있으면 충분)
    prisma.match.findMany({
      where: {
        league: match.league,
        status: "FINISHED",
        startTime: { gte: seasonStart, lt: match.startTime },
      },
      select: {
        id: true, league: true,
        homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true,
        startTime: true, status: true,
      },
    }),
    // H2H — 양 팀끼리만 (시즌 무관 최근 H2H_MAX)
    prisma.match.findMany({
      where: {
        league: match.league,
        status: "FINISHED",
        startTime: { lt: match.startTime },
        OR: [
          { homeTeamId: match.homeTeam.id, awayTeamId: match.awayTeam.id },
          { homeTeamId: match.awayTeam.id, awayTeamId: match.homeTeam.id },
        ],
      },
      select: {
        homeTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
      orderBy: { startTime: "desc" },
      take: H2H_MAX,
    }),
    // 프리뷰 / 리뷰 article slug — 같은 매치 PUBLISHED
    prisma.article.findMany({
      where: { matchId: match.id, status: "PUBLISHED" },
      select: { slug: true, type: true },
    }),
  ]);

  const formMatches: PredictMatch[] = recentForForm.map((m) => ({
    id: m.id,
    league: m.league,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    startTime: m.startTime,
    status: m.status as PredictMatch["status"],
  }));
  const homeForm = calcForm(formMatches, match.homeTeam.id, match.startTime, 5);
  const awayForm = calcForm(formMatches, match.awayTeam.id, match.startTime, 5);

  const seasonMatches: PredictMatch[] = allSeason.map((m) => ({
    id: m.id,
    league: m.league,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    startTime: m.startTime,
    status: m.status as PredictMatch["status"],
  }));
  const standings = calcStandings(seasonMatches, match.startTime);

  // H2H — home 관점
  const h2hResults: FormResult[] = h2hMatches.map((m) => {
    if (m.homeScore == null || m.awayScore == null) return "D";
    const homeIsOurHome = m.homeTeamId === match.homeTeam.id;
    const ourScore = homeIsOurHome ? m.homeScore : m.awayScore;
    const oppScore = homeIsOurHome ? m.awayScore : m.homeScore;
    if (ourScore > oppScore) return "W";
    if (ourScore < oppScore) return "L";
    return "D";
  });
  const h2hHome: H2HResult = {
    results: h2hResults,
    wins: h2hResults.filter((r) => r === "W").length,
    draws: h2hResults.filter((r) => r === "D").length,
    losses: h2hResults.filter((r) => r === "L").length,
  };

  const previewSlug =
    articles.find((a) => a.type === "PREVIEW")?.slug ?? null;
  const recapSlug = articles.find((a) => a.type === "RECAP")?.slug ?? null;

  function lite(row: ReturnType<typeof standings.byTeam.get>): StandingLite | null {
    if (!row) return null;
    return {
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      position: row.position,
    };
  }

  return {
    homeForm,
    awayForm,
    homeStanding: lite(standings.byTeam.get(match.homeTeam.id)),
    awayStanding: lite(standings.byTeam.get(match.awayTeam.id)),
    totalTeams: standings.rows.length,
    h2hHome,
    previewSlug,
    recapSlug,
  };
}
