// Elo 레이팅 계산.
// 모든 팀이 동일한 시작점(1500)에서 출발해, FINISHED 매치를 시간순으로
// 처리하며 누적 갱신한다.
//
// 공식: R_new = R_old + K * (S - E)
//   K = 20 (축구는 20~32, 농구·야구도 동일 범위)
//   S = 실제 결과 (승=1, 무=0.5, 패=0)
//   E = 기댓값 = 1 / (1 + 10^((R_opp - R_self) / 400))

import type { PredictMatch } from "./types";

export const STARTING_ELO = 1500;
const K_FACTOR = 20;
const HOME_ADVANTAGE_ELO = 100;

export interface EloTable {
  /** teamId → 현재 Elo 점수 */
  ratings: Map<number, number>;
  /** 처리한 매치 수 */
  processed: number;
}

function expectedScore(rA: number, rB: number): number {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * 입력된 매치 목록을 시간순으로 처리해 최종 Elo 테이블을 반환.
 * SCHEDULED / 점수 없는 매치는 무시.
 */
export function calcEloTable(matches: PredictMatch[]): EloTable {
  const ratings = new Map<number, number>();
  let processed = 0;

  // 시간순(과거→현재) 정렬 후 처리
  const sorted = [...matches].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  for (const m of sorted) {
    if (
      m.status !== "FINISHED" ||
      m.homeScore === null ||
      m.awayScore === null
    ) {
      continue;
    }

    const home = ratings.get(m.homeTeamId) ?? STARTING_ELO;
    const away = ratings.get(m.awayTeamId) ?? STARTING_ELO;

    // 홈 어드밴티지 반영
    const expHome = expectedScore(home + HOME_ADVANTAGE_ELO, away);

    let s: number;
    if (m.homeScore > m.awayScore) s = 1;
    else if (m.homeScore < m.awayScore) s = 0;
    else s = 0.5;

    const newHome = home + K_FACTOR * (s - expHome);
    const newAway = away + K_FACTOR * (1 - s - (1 - expHome));

    ratings.set(m.homeTeamId, newHome);
    ratings.set(m.awayTeamId, newAway);
    processed++;
  }

  return { ratings, processed };
}

export function getElo(table: EloTable, teamId: number): number {
  return table.ratings.get(teamId) ?? STARTING_ELO;
}
