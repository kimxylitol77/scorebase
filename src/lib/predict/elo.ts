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
import { LOL_LEAGUES, BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

// 피타고리안 혼합 적용 야구 리그 — sport-leagues 단일 진실 재사용
const BASEBALL_ELO_LEAGUES = BASEBALL_LEAGUES;

export const STARTING_ELO = 1500;
const K_FACTOR = 20;
const HOME_ADVANTAGE_ELO = 100;

// e스포츠는 한 스튜디오에서 진행되는 BO 시리즈라 홈/어웨이 어드밴티지가 무의미.
// "LOL"(LCK) 만 하드코딩돼 LPL/LEC/LCS 가 EPL 취급되던 버그 → LOL_LEAGUES 단일 진실로.
function homeAdvantageFor(league: string): number {
  if (LOL_LEAGUES.has(league)) return 0;
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
 * 매치 1건을 Elo 테이블에 반영 (calcEloTable 루프 본체 추출 — 로직 동일).
 * member-bot 백테스트가 시간순 단일 스캔으로 as-of Elo 를 뽑을 때 재사용한다.
 * FINISHED + 점수 있는 매치만 반영, 반영했으면 true.
 */
export function applyEloMatch(
  ratings: Map<number, number>,
  m: PredictMatch,
): boolean {
  if (
    m.status !== "FINISHED" ||
    m.homeScore === null ||
    m.awayScore === null
  ) {
    return false;
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

  // xG-Elo (2026-06-10 백테스트 채택: xgRes 변형 — 7리그 중 6개 Brier 개선):
  //   마진 = |0.7×xG차 + 0.3×골차|, 결과 S = 실제 0.5 + xG기반 0.5 (±0.35 임계)
  //   → 운 좋은 1-0 승리(xG 열세)는 Elo 상승 디스카운트, 정당한 압박 패배는 보존.
  // xG 없는 매치(아시아 리그·과거 데이터)는 아래 분기 전부 기존 골 마진과 동일.
  const goalDiffSigned = m.homeScore - m.awayScore;
  const hasXg = m.xgHome != null && m.xgAway != null;
  const xgDiff = hasXg ? m.xgHome! - m.xgAway! : goalDiffSigned;
  if (hasXg) {
    const sXg = xgDiff > 0.35 ? 1 : xgDiff < -0.35 ? 0 : 0.5;
    s = 0.5 * s + 0.5 * sXg;
  }

  // 피타고리안-Elo (야구, 2026-06-10 백테스트 채택: pyth70 — KBO Brier 0.5403→0.5355
  // ·적중 53.6→54.0, MLB Brier 0.5291→0.5251): 단판 분산이 극심한 야구는 승패(S)보다
  // 그 경기 득실 기반 기대승률 h^1.83/(h^1.83+a^1.83) 이 미래 예측력 ↑ —
  // 1점차 진땀승은 S≈0.55 로 평활, 대승만 온전히 반영.
  const isPythBaseball = BASEBALL_ELO_LEAGUES.has(m.league);
  if (isPythBaseball && (m.homeScore > 0 || m.awayScore > 0)) {
    const E = 1.83;
    const hp = Math.pow(Math.max(m.homeScore, 0.5), E);
    const ap = Math.pow(Math.max(m.awayScore, 0.5), E);
    s = 0.3 * s + 0.7 * (hp / (hp + ap));
  }

  // FiveThirtyEight 스타일 MoV 가중치 — 점수 차이가 클수록 K 커짐
  // ln(|diff|+1) 로 diminishing return; eloDiff 큰 매치에서는 약화
  const margin = hasXg
    ? Math.abs(0.7 * xgDiff + 0.3 * goalDiffSigned)
    : Math.abs(goalDiffSigned);
  const eloDiffSigned = home + ha - away;
  const homeIsWinner = hasXg || isPythBaseball ? s >= 0.5 : s === 1;
  const winnerEloDiff = homeIsWinner ? eloDiffSigned : -eloDiffSigned;
  const movMultiplier =
    Math.log(margin + 1) * (2.2 / (Math.abs(winnerEloDiff) * 0.001 + 2.2));
  const kEff = K_FACTOR * Math.max(1, movMultiplier);

  const newHome = home + kEff * (s - expHome);
  const newAway = away + kEff * (1 - s - (1 - expHome));

  ratings.set(m.homeTeamId, newHome);
  ratings.set(m.awayTeamId, newAway);
  return true;
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
    if (applyEloMatch(ratings, m)) processed++;
  }

  return { ratings, processed };
}

export function getElo(table: EloTable, teamId: number): number {
  return table.ratings.get(teamId) ?? STARTING_ELO;
}

/**
 * Elo 테이블의 표준편차 — 리그 레이팅이 얼마나 벌어졌는지 (부트스트랩 품질 지표).
 * 풀시즌 리그 70~82, 시즌 중반 수집 시작 리그 25~50 (2026-06 실측).
 */
export function eloSpread(table: EloTable): number {
  const xs = [...table.ratings.values()];
  if (xs.length < 2) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
}
