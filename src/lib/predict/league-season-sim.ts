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

async function computeLeagueSeasonSim(league: string): Promise<LeagueSeasonSim> {
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
