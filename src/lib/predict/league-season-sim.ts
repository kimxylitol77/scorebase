// 리그 시즌 시뮬레이션 공용 캐시(1h) — 예측 페이지·홈 시즌 인사이트 카드 2종·리그 허브 예측 탭이 같은 결과를 읽는다.
// 몬테카를로에 시드가 없어 페이지마다 따로 돌리면 ±1%p 어긋났다(KBO 는 getKboSeasonSim 이 같은 이유로 이미 공용).
// 규칙: 시즌 창(selectSeasonMatches) → 야구 올스타 제외 → NBA 정규 30팀만 → runMonteCarlo 5,000 → 일정 결손 가드.
// KBO(공용 캐시 시뮬)·월드컵(토너먼트 시뮬)은 예측 페이지 고유 경로 — 이 로더는 그 둘에 canSimulate=false 를 준다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { runMonteCarlo, type MonteCarloRow } from "@/lib/predict/monte-carlo";
import { checkScheduleIntegrity } from "@/lib/predict/schedule-integrity";
import { selectSeasonMatches } from "@/lib/predict/season-matches";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";
import { relegationCountOf } from "@/lib/predict/prediction-leagues";
import type { PredictMatch } from "@/lib/predict/types";
import { UEFA_DIRECT_R16, UEFA_LEAGUE_PHASE, UEFA_PLAYOFF_LAST, uefaStage } from "@/lib/sports/uefa-league-phase";

export interface LeagueSeasonSim {
  league: string;
  rows: MonteCarloRow[];
  finished: number;
  scheduled: number;
  /** 완료 20경기 미만이면 시뮬 안 함(표본 부족 극단값 방지) */
  canSimulate: boolean;
  /** 일정 결손 가드 — false 면 우승 확률을 화면에 내지 않는다(99.9% 오보 방지) */
  trustworthy: boolean;
  isPreviousSeason: boolean;
  seasonLabel: string | null;
  relegationCount: number;
  /** UEFA 클럽대회 — 리그페이즈(36팀)만 시뮬. champion = 리그페이즈 1위, topN[8] = 16강 직행,
   *  topN[24] = 녹아웃 PO 이상, relegation = 25위 이하 탈락. 화면은 "우승" 이라 부르면 안 된다. */
  uefaLeaguePhase?: boolean;
  computedAt: string;
}

export const SIM_MIN_FINISHED = 20;
const NO_GENERIC_SIM = new Set(["KBO", "WORLD_CUP"]);
// NBA — 정규 30팀만 (DB 에 친선·올스타·국제 팀이 섞여 있어 시뮬 노이즈 제거). 예측 페이지와 같은 목록.
const NBA_REGULAR_30 = new Set([
  "TOR","MIA","NY","CHI","BKN","IND","BOS","HOU","PHI","GS",
  "LAL","CHA","DET","WSH","ATL","CLE","NO","ORL","MIL","SA",
  "DAL","DEN","OKC","MIN","UTAH","MEM","POR","LAC","SAC","PHX",
]);

/**
 * UEFA 리그페이즈 시뮬 — 예선이 섞이면 76팀 표가 되고 예선 승점이 리그페이즈 순위를 부풀린다
 * (2026-09-25 UEL 실측: 페렌츠바로시 "우승 85%"). 리그페이즈 경기만, Elo 는 대회 전 시즌 기록으로 시드.
 */
async function computeUefaLeaguePhaseSim(league: string): Promise<LeagueSeasonSim> {
  const all = await prisma.match.findMany({
    where: { league },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true, raw: true },
  });
  const sel = selectSeasonMatches(all, league);
  const seasonIds = new Set(sel.season.map((m) => m.id));
  const season = all.filter((m) => seasonIds.has(m.id));
  const lpLabeled = season.filter((m) => uefaStage(m.raw)?.leagueRound);
  const lpTeams = new Set(lpLabeled.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
  const lpStart = lpLabeled.reduce<Date | null>((a, m) => (!a || m.startTime < a ? m.startTime : a), null);
  // 라운드 정보가 아직 없는 행(수집기가 곧 채운다)도 리그페이즈 팀끼리·리그페이즈 기간이면 포함.
  const lp = season.filter(
    (m) =>
      uefaStage(m.raw)?.leagueRound ||
      (!uefaStage(m.raw) && lpStart && m.startTime >= lpStart && lpTeams.has(m.homeTeamId) && lpTeams.has(m.awayTeamId)),
  );
  const matches: PredictMatch[] = lp.map(({ raw: _raw, ...m }) => (void _raw, m));
  const finished = matches.filter((m) => m.status === "FINISHED").length;
  const scheduled = matches.filter((m) => m.status === "SCHEDULED").length;
  const relegationCount = Math.max(0, lpTeams.size - UEFA_PLAYOFF_LAST);
  // 리그페이즈는 한 라운드(18경기)만 끝나도 시드 Elo 가 있어 계산이 성립한다.
  const canSimulate = lpTeams.size >= 30 && finished >= 9 && scheduled > 0;
  const seed: PredictMatch[] = all.filter((m) => m.status === "FINISHED").map(({ raw: _raw, ...m }) => (void _raw, m));
  const rows = canSimulate
    ? runMonteCarlo(matches, league, { iterations: 5000, relegationCount, topCutoffs: [UEFA_DIRECT_R16, UEFA_PLAYOFF_LAST], eloSeedMatches: seed })
    : [];
  const topChampion = rows.length > 0 ? Math.max(...rows.map((r) => r.champion)) : 0;
  const trustworthy = rows.length > 0 ? checkScheduleIntegrity(matches, topChampion).trustworthy : false;
  return {
    league, rows, finished, scheduled, canSimulate, trustworthy,
    isPreviousSeason: sel.isPreviousSeason, seasonLabel: sel.seasonLabel, relegationCount,
    uefaLeaguePhase: true,
    computedAt: new Date().toISOString(),
  };
}

async function computeLeagueSeasonSim(league: string): Promise<LeagueSeasonSim> {
  if (UEFA_LEAGUE_PHASE[league]) return computeUefaLeaguePhaseSim(league);
  const all = await prisma.match.findMany({
    where: { league },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
  });
  const sel = selectSeasonMatches(all, league);
  let matches: PredictMatch[] = stripBaseballAllStarMatches(sel.season).map((m) => ({ ...m }));
  if (league === "NBA") {
    const teams = await prisma.team.findMany({ where: { league }, select: { id: true, shortName: true } });
    const ok = new Set(teams.filter((t) => t.shortName && NBA_REGULAR_30.has(t.shortName)).map((t) => t.id));
    matches = matches.filter((m) => ok.has(m.homeTeamId) && ok.has(m.awayTeamId));
  }
  const finished = matches.filter((m) => m.status === "FINISHED").length;
  const scheduled = matches.filter((m) => m.status === "SCHEDULED").length;
  const relegationCount = relegationCountOf(league);
  const canSimulate = !NO_GENERIC_SIM.has(league) && finished >= SIM_MIN_FINISHED && scheduled > 0;
  const rows = canSimulate ? runMonteCarlo(matches, league, { iterations: 5000, relegationCount }) : [];
  const topChampion = rows.length > 0 ? Math.max(...rows.map((r) => r.champion)) : 0;
  const trustworthy = rows.length > 0 ? checkScheduleIntegrity(matches, topChampion).trustworthy : false;
  return {
    league, rows, finished, scheduled, canSimulate, trustworthy,
    isPreviousSeason: sel.isPreviousSeason, seasonLabel: sel.seasonLabel, relegationCount,
    computedAt: new Date().toISOString(),
  };
}

export const getLeagueSeasonSim = unstable_cache(computeLeagueSeasonSim, ["league-season-sim"], {
  revalidate: 3600,
  tags: ["league-season-sim"],
});
