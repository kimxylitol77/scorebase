// 시즌 Monte Carlo 시뮬레이션.
//
// 동작:
//   1) 현재까지 FINISHED 매치로 시즌 standings 누적
//   2) SCHEDULED 매치 각각에 대해 Elo 기반 winProb 계산
//   3) N 회 (기본 5,000~10,000) 시뮬레이션:
//      - 각 SCHEDULED 매치를 winProb 분포로 random sample (홈승/무/원정승)
//      - 시즌 끝났을 때 final standings 만들기
//      - 우승/Top4/강등(하위 3) 카운트
//   4) 평균 / 확률 계산
//
// EPL 예시 출력:
//   [
//     { teamId, teamName, champion: 0.73, top4: 0.99, top6: 1.0, relegation: 0.0,
//       expectedPoints: 92.4, expectedPosition: 1.2 },
//     ...
//   ]

import type { PredictMatch } from "./types";
import { calcStandings, type StandingRow } from "./standings";
import { calcEloTable, getElo } from "./elo";
import { calcWinProbability } from "./win-probability";

export interface MonteCarloOptions {
  /** 시뮬레이션 반복 횟수 (기본 5,000) */
  iterations?: number;
  /** 강등권 기준 (기본 3 — EPL) */
  relegationCount?: number;
  /** Top N 진출권 (기본 [4, 6] — 챔스/유로파) */
  topCutoffs?: number[];
  /** 시드 (재현성 X — Math.random) */
}

export interface MonteCarloRow {
  teamId: number;
  champion: number; // 0~1
  top4: number;
  top6: number;
  relegation: number;
  /** 평균 최종 승점 */
  expectedPoints: number;
  /** 평균 최종 순위 (1-based, 낮을수록 좋음) */
  expectedPosition: number;
  /** 현재 (FINISHED 누적) 승점 */
  currentPoints: number;
  currentPosition: number;
}

interface FixedRow {
  teamId: number;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
}

export function runMonteCarlo(
  matches: PredictMatch[],
  league: string,
  options: MonteCarloOptions = {},
): MonteCarloRow[] {
  const iterations = options.iterations ?? 5000;
  const relegationCount = options.relegationCount ?? 3;

  // 1) 현재 시즌 standings (FINISHED 매치로 누적)
  const fixed = calcStandings(matches);
  const fixedByTeam = new Map<number, FixedRow>();
  for (const r of fixed.rows) {
    fixedByTeam.set(r.teamId, {
      teamId: r.teamId,
      played: r.played,
      points: r.points,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalDiff,
    });
  }

  // 2) SCHEDULED 매치 + Elo 기반 winProb 미리 계산
  const eloTable = calcEloTable(matches);
  const scheduled = matches.filter(
    (m) => m.status === "SCHEDULED" && m.league === league,
  );

  interface PendingMatch {
    homeTeamId: number;
    awayTeamId: number;
    pHome: number;
    pDraw: number;
    pAway: number;
    /** 시뮬레이션 시 평균 골 추정 — 단순화 */
    expHomeGoals: number;
    expAwayGoals: number;
  }

  const pending: PendingMatch[] = scheduled.map((m) => {
    const homeElo = getElo(eloTable, m.homeTeamId);
    const awayElo = getElo(eloTable, m.awayTeamId);
    const wp = calcWinProbability(homeElo, awayElo, league);
    // 단순 골 추정 (Elo 차이 기반 변형, 평균 1.5골 가정)
    const baseGoals = 1.5;
    const eloDiff = homeElo + 100 - awayElo; // 홈 어드밴티지 포함
    const homeBoost = 1 + Math.max(-0.5, Math.min(0.5, eloDiff / 800));
    return {
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      pHome: wp.home,
      pDraw: wp.draw,
      pAway: wp.away,
      expHomeGoals: baseGoals * homeBoost,
      expAwayGoals: baseGoals * (2 - homeBoost),
    };
  });

  // 3) 누적용 카운터
  const accChampion = new Map<number, number>();
  const accTop4 = new Map<number, number>();
  const accTop6 = new Map<number, number>();
  const accRelegation = new Map<number, number>();
  const accPoints = new Map<number, number>();
  const accPosition = new Map<number, number>();

  function inc(map: Map<number, number>, k: number, v = 1) {
    map.set(k, (map.get(k) ?? 0) + v);
  }

  // 4) 메인 루프
  for (let iter = 0; iter < iterations; iter++) {
    // 시드 매치 결과 복제
    const sim = new Map<number, FixedRow>();
    for (const [k, v] of fixedByTeam) {
      sim.set(k, { ...v });
    }

    function ensure(teamId: number): FixedRow {
      if (!sim.has(teamId)) {
        sim.set(teamId, {
          teamId,
          played: 0,
          points: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDiff: 0,
        });
      }
      return sim.get(teamId)!;
    }

    // 모든 SCHEDULED 매치 시뮬레이션
    for (const p of pending) {
      const r = Math.random();
      let homeGoals: number;
      let awayGoals: number;

      // 단순화: 결과(승/무/패) 확률로 결정 → 골 차이만 보정
      if (r < p.pHome) {
        // 홈 승
        homeGoals = Math.max(1, Math.round(p.expHomeGoals + Math.random()));
        awayGoals = Math.max(0, Math.round(p.expAwayGoals - 0.5));
        if (awayGoals >= homeGoals) homeGoals = awayGoals + 1;
      } else if (r < p.pHome + p.pDraw) {
        // 무
        const g = Math.max(0, Math.round((p.expHomeGoals + p.expAwayGoals) / 2));
        homeGoals = g;
        awayGoals = g;
      } else {
        // 원정 승
        awayGoals = Math.max(1, Math.round(p.expAwayGoals + Math.random()));
        homeGoals = Math.max(0, Math.round(p.expHomeGoals - 0.5));
        if (homeGoals >= awayGoals) awayGoals = homeGoals + 1;
      }

      const h = ensure(p.homeTeamId);
      const a = ensure(p.awayTeamId);
      h.played++;
      a.played++;
      h.goalsFor += homeGoals;
      h.goalsAgainst += awayGoals;
      a.goalsFor += awayGoals;
      a.goalsAgainst += homeGoals;
      if (homeGoals > awayGoals) h.points += 3;
      else if (homeGoals < awayGoals) a.points += 3;
      else {
        h.points += 1;
        a.points += 1;
      }
    }

    for (const r of sim.values()) r.goalDiff = r.goalsFor - r.goalsAgainst;

    // 최종 순위
    const finalRows = Array.from(sim.values()).sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor,
    );

    finalRows.forEach((row, i) => {
      const pos = i + 1;
      inc(accPoints, row.teamId, row.points);
      inc(accPosition, row.teamId, pos);
      if (pos === 1) inc(accChampion, row.teamId);
      if (pos <= 4) inc(accTop4, row.teamId);
      if (pos <= 6) inc(accTop6, row.teamId);
      if (pos > finalRows.length - relegationCount) inc(accRelegation, row.teamId);
    });
  }

  // 5) 결과 정리
  const result: MonteCarloRow[] = [];
  for (const teamId of fixedByTeam.keys()) {
    const currentRow = fixed.byTeam.get(teamId);
    result.push({
      teamId,
      champion: (accChampion.get(teamId) ?? 0) / iterations,
      top4: (accTop4.get(teamId) ?? 0) / iterations,
      top6: (accTop6.get(teamId) ?? 0) / iterations,
      relegation: (accRelegation.get(teamId) ?? 0) / iterations,
      expectedPoints: (accPoints.get(teamId) ?? 0) / iterations,
      expectedPosition: (accPosition.get(teamId) ?? 0) / iterations,
      currentPoints: currentRow?.points ?? 0,
      currentPosition: currentRow?.position ?? 0,
    });
  }

  result.sort((a, b) => a.expectedPosition - b.expectedPosition);
  return result;
}
