// Elo 레이팅 계산.
// FIDE/FiveThirtyEight 스타일 — 골 마진(MoV) 가중치 + 업셋 보정 적용.
//
// 공식: R_new = R_old + K_eff * (S - E)
//   S = 실제 결과 (승=1, 무=0.5, 패=0)
//   E = 1 / (1 + 10^((R_opp - R_self) / 400))
//   K_eff = K * MoV * Upset
//
//   MoV (Margin of Victory) = ln(|goalDiff| + 1) * (2.2 / (eloDiff*0.001 + 2.2))
//     → 4-0 압승은 1-0 신승보다 더 큰 Elo 변화
//     → 단, 강팀의 압승은 약간 디스카운트 (이미 예상된 결과)
//   Upset = 1 (현 버전에서는 MoV 만 적용)

import type { PredictMatch } from "./types";

export const STARTING_ELO = 1500;
const K_FACTOR = 20;
const HOME_ADVANTAGE_ELO = 100;

// LoL/LCK 는 한 스튜디오에서 진행되는 BO 시리즈라 홈/어웨이 어드밴티지가 무의미.
function homeAdvantageFor(league: string): number {
  if (league === "LOL") return 0;
  return HOME_ADVANTAGE_ELO;
}

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

    // 홈 어드밴티지 반영 (LoL은 0)
    const ha = homeAdvantageFor(m.league);
    const expHome = expectedScore(home + ha, away);

    let s: number;
    if (m.homeScore > m.awayScore) s = 1;
    else if (m.homeScore < m.awayScore) s = 0;
    else s = 0.5;

    // FiveThirtyEight 스타일 MoV 가중치 — 점수 차이가 클수록 K 커짐
    // ln(|diff|+1) 로 diminishing return; eloDiff 큰 매치에서는 약화
    const goalDiff = Math.abs(m.homeScore - m.awayScore);
    const eloDiffSigned = home + ha - away;
    const winnerEloDiff = s === 1 ? eloDiffSigned : -eloDiffSigned;
    const movMultiplier =
      Math.log(goalDiff + 1) * (2.2 / (Math.abs(winnerEloDiff) * 0.001 + 2.2));
    const kEff = K_FACTOR * Math.max(1, movMultiplier);

    const newHome = home + kEff * (s - expHome);
    const newAway = away + kEff * (1 - s - (1 - expHome));

    ratings.set(m.homeTeamId, newHome);
    ratings.set(m.awayTeamId, newAway);
    processed++;
  }

  return { ratings, processed };
}

export function getElo(table: EloTable, teamId: number): number {
  return table.ratings.get(teamId) ?? STARTING_ELO;
}
