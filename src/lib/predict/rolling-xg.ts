// 팀 최근 N경기 rolling xG 득실(momentum) 신호 — 축구 1X2 변별력 보강.
//
// 배경: 최종 1X2 는 Dixon-Coles 0.85 + Elo 0.15 블렌드라, xG 가 들어가는 elo(xG-Elo)
// 경로가 15% 로 희석돼 "최근 xG 폼"이 약하게만 반영된다. 이를 독립 shift 로 보강.
//
// 백테스트 (2026-06-13, 빅5+MLS walk-forward 1500건, base=운영 predHome):
//   strength = mean(xgFor - xgAgainst) 최근 8경기, shift=(homeStr-awayStr)*0.06 cap±0.12
//   → 전체 Brier -1.84%·test(홀드아웃 30%) -1.56%·리그별 빅5+MLS 전부 개선.
//   누수/우연 검증: anti(부호반전) +5.0% 악화·shuffle(신호파괴) ≈0 → 진짜 변별 신호 확정.
//   UCL 은 크로스리그라 같은-리그 rolling 비교 부정확(+0.17% 악화) → 제외.
//   luck(실제-기대 괴리, regression 가설)은 무효(+0.3~1.3% 악화) → 미채택.

import type { PredictMatch } from "./types";

// xG momentum 적용 리그 — 빅5 + MLS. UCL/WORLD_CUP 제외(크로스리그·표본부족).
export const XG_MOMENTUM_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
]);

const N_GAMES = 8; // rolling window 상한
const MIN_GAMES = 3; // 신호 최소 표본 (이하면 null)
const SCALE = 0.06; // strength 차이 → 확률 shift 환산
const CAP = 0.12; // 최대 ±12%p shift
const MIN_SHIFT = 0.005; // 노이즈 무시 임계

/**
 * 팀의 referenceTime 이전 FINISHED + xG 보유 매치 최근 N경기 평균 xG 득실(xgFor - xgAgainst).
 * xG 표본 < MIN_GAMES 면 null (신호 미적용). matches 에 xgHome/xgAway 주입돼 있어야 함.
 */
export function rollingXgStrength(
  matches: PredictMatch[],
  teamId: number,
  referenceTime: Date,
): number | null {
  const t = referenceTime.getTime();
  const recent = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.startTime.getTime() < t &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        m.xgHome != null &&
        m.xgAway != null,
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, N_GAMES);
  if (recent.length < MIN_GAMES) return null;
  let sum = 0;
  for (const m of recent) {
    const isHome = m.homeTeamId === teamId;
    const xgF = isHome ? m.xgHome! : m.xgAway!;
    const xgA = isHome ? m.xgAway! : m.xgHome!;
    sum += xgF - xgA;
  }
  return sum / recent.length;
}

/**
 * xG momentum 으로 인한 홈 확률 shift (양수=홈↑, 음수=원정↑). 0 이면 미적용.
 * 리그 가드(XG_MOMENTUM_LEAGUES) + 양쪽 신호 존재 + 노이즈 임계 통과 시에만 비0.
 */
export function xgMomentumShift(
  league: string,
  homeStrength: number | null | undefined,
  awayStrength: number | null | undefined,
): number {
  if (!XG_MOMENTUM_LEAGUES.has(league)) return 0;
  if (homeStrength == null || awayStrength == null) return 0;
  const raw = (homeStrength - awayStrength) * SCALE;
  const shift = Math.max(-CAP, Math.min(CAP, raw));
  return Math.abs(shift) < MIN_SHIFT ? 0 : shift;
}
