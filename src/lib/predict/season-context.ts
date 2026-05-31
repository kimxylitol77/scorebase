// 시즌 종합 분석 글에 필요한 컨텍스트 빌더.
// 한 리그의 큰 그림: 상위/하위 팀, 공격/수비, 흐름, MC 시뮬, 빅매치.

import type { PredictMatch } from "./types";
import { calcStandings, type StandingRow } from "./standings";
import { calcEloTable, getElo } from "./elo";
import { calcStreaks } from "./streak";
import { calcRecentTrend } from "./recent-trend";
import { runMonteCarlo, type MonteCarloRow } from "./monte-carlo";

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
}

export function buildSeasonContext(
  matches: PredictMatch[],
  league: string,
  opts: BuildOptions = {},
): SeasonContext {
  const finished = matches.filter((m) => m.status === "FINISHED");
  const scheduled = matches.filter((m) => m.status === "SCHEDULED");

  const standings = calcStandings(matches);
  const eloTable = calcEloTable(matches);

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
