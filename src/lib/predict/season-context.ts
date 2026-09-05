// 시즌 종합 분석 글에 필요한 컨텍스트 빌더.
// 한 리그의 큰 그림: 상위/하위 팀, 공격/수비, 흐름, MC 시뮬, 빅매치.

import type { PredictMatch } from "./types";
import { calcStandings, type StandingRow } from "./standings";
import { calcEloTable, getElo } from "./elo";
import { calcStreaks } from "./streak";
import { calcRecentTrend } from "./recent-trend";
import { runMonteCarlo, type MonteCarloRow } from "./monte-carlo";
import { checkScheduleIntegrity } from "./schedule-integrity";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";

export interface TeamStreakSummary {
  teamId: number;
  unbeatenRun: number;
  winningRun: number;
  losingRun: number;
}

export interface SeasonContext {
  league: string;
  finishedCount: number;
  scheduledCount: number;
  totalTeams: number;

  /** 1~5위 (또는 전체 적게 있을 시 그만큼) */
  topRows: StandingRow[];
  /** 강등/하위권 (하위 3) */
  bottomRows: StandingRow[];

  /** 공격력 Top 3 (이름·경기당 득점) */
  topAttack: Array<{ teamId: number; perGame: number }>;
  /** 수비력 Top 3 (이름·경기당 실점, 적을수록 좋음) */
  topDefense: Array<{ teamId: number; perGame: number }>;

  /** 가장 뜨거운 팀 (winningRun ≥ 3 또는 unbeatenRun ≥ 5) */
  hotTeams: TeamStreakSummary[];
  /** 가장 차가운 팀 (losingRun ≥ 2) */
  coldTeams: TeamStreakSummary[];

  /** Elo 변동 큰 팀 — 직전 N경기 평균 PPG 기반 (단순화) */
  risingTeams: Array<{ teamId: number; ppg: number; gf: number; ga: number }>;

  /** Monte Carlo 시뮬 (있으면) */
  mc?: MonteCarloRow[];
  mcRelegationCount?: number;

  /** 다가오는 빅매치 (Elo 합 가장 높은 1~2개) */
  bigMatches: Array<{
    matchId: number;
    homeTeamId: number;
    awayTeamId: number;
    startTime: Date;
    homeElo: number;
    awayElo: number;
  }>;
}

interface BuildOptions {
  relegationCount?: number;
  iterations?: number;
  /** Elo 계산용 경기 집합 — 순위·시뮬은 이번 시즌만 쓰되 Elo 는 시즌을 넘어 누적돼야 할 때 전 시즌 경기를 넘긴다. 미지정이면 inputMatches. */
  eloMatches?: PredictMatch[];
}

export function buildSeasonContext(
  inputMatches: PredictMatch[],
  league: string,
  opts: BuildOptions = {},
): SeasonContext {
  // 올스타전 제외 — 여기서 뽑는 순위·공수 지표·연승/연패는 ANALYSIS 글 본문에 그대로 실린다.
  // (runMonteCarlo 는 자체적으로도 거르지만 standings 계열은 이 필터가 없으면 12팀으로 잡힘)
  const matches = stripBaseballAllStarMatches(inputMatches);
  const finished = matches.filter((m) => m.status === "FINISHED");
  const scheduled = matches.filter((m) => m.status === "SCHEDULED");

  const standings = calcStandings(matches);
  const eloTable = calcEloTable(opts.eloMatches ? stripBaseballAllStarMatches(opts.eloMatches) : matches);

  const topRows = standings.rows.slice(0, 5);
  const totalTeams = standings.rows.length;
  const bottomCount = Math.min(3, totalTeams);
  const bottomRows = standings.rows.slice(-bottomCount).reverse();

  const teamsForRanking = standings.rows.filter((r) => r.played >= 5);
  const topAttack = [...teamsForRanking]
    .sort((a, b) => b.goalsFor / b.played - a.goalsFor / a.played)
    .slice(0, 3)
    .map((r) => ({ teamId: r.teamId, perGame: r.goalsFor / r.played }));
  const topDefense = [...teamsForRanking]
    .sort((a, b) => a.goalsAgainst / a.played - b.goalsAgainst / b.played)
    .slice(0, 3)
    .map((r) => ({ teamId: r.teamId, perGame: r.goalsAgainst / r.played }));

  // 흐름
  const hotTeams: TeamStreakSummary[] = [];
  const coldTeams: TeamStreakSummary[] = [];
  for (const r of standings.rows) {
    const s = calcStreaks(matches, r.teamId);
    if (s.winningRun >= 3 || s.unbeatenRun >= 5) {
      hotTeams.push({
        teamId: r.teamId,
        unbeatenRun: s.unbeatenRun,
        winningRun: s.winningRun,
        losingRun: s.losingRun,
      });
    }
    if (s.losingRun >= 3) {
      coldTeams.push({
        teamId: r.teamId,
        unbeatenRun: s.unbeatenRun,
        winningRun: s.winningRun,
        losingRun: s.losingRun,
      });
    }
  }
  hotTeams.sort((a, b) => b.winningRun - a.winningRun || b.unbeatenRun - a.unbeatenRun);
  coldTeams.sort((a, b) => b.losingRun - a.losingRun);

  // Rising — 최근 5경기 평균 PPG 기준 Top 5
  const rising: Array<{ teamId: number; ppg: number; gf: number; ga: number }> =
    standings.rows
      .map((r) => {
        const t = calcRecentTrend(matches, r.teamId, undefined, 5);
        return {
          teamId: r.teamId,
          ppg: t.ppg,
          gf: t.avgGoalsFor,
          ga: t.avgGoalsAgainst,
        };
      })
      .sort((a, b) => b.ppg - a.ppg)
      .slice(0, 5);

  // Monte Carlo
  let mc: MonteCarloRow[] | undefined;
  if (scheduled.length > 0 && finished.length >= 20) {
    mc = runMonteCarlo(matches, league, {
      iterations: opts.iterations ?? 5000,
      relegationCount: opts.relegationCount ?? 0,
    });
    // DB 일정이 잘린 리그는 시뮬이 극단 확률(99.9%)을 낸다. 화면과 같은 판정으로 통째로
    // 버린다 — ANALYSIS 글은 이 mc 로 "우승 확률" 문단을 쓰므로 발행물까지 오보가 번진다.
    // (2026-08-27 실측: K리그1·MLS)
    if (mc.length > 0) {
      const topChampion = Math.max(...mc.map((r) => r.champion));
      if (!checkScheduleIntegrity(matches, topChampion).trustworthy) mc = undefined;
    }
  }

  // 빅매치 (Elo 합 가장 높은 SCHEDULED 매치)
  const bigMatches = scheduled
    .map((m) => ({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      startTime: m.startTime,
      homeElo: getElo(eloTable, m.homeTeamId),
      awayElo: getElo(eloTable, m.awayTeamId),
    }))
    .sort((a, b) => b.homeElo + b.awayElo - (a.homeElo + a.awayElo))
    .slice(0, 2);

  return {
    league,
    finishedCount: finished.length,
    scheduledCount: scheduled.length,
    totalTeams,
    topRows,
    bottomRows,
    topAttack,
    topDefense,
    hotTeams: hotTeams.slice(0, 3),
    coldTeams: coldTeams.slice(0, 3),
    risingTeams: rising,
    mc,
    mcRelegationCount: opts.relegationCount,
    bigMatches,
  };
}
