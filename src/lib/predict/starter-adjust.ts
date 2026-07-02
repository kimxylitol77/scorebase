// MLB 선발 투수 보정 — 1X2 winProb / 마켓 expected runs 에 ERA·WHIP 가중치 추가.
//
// 통계 근거 (MLB):
// - ERA 1점 차이 ≈ 매치당 승률 차이 약 5%p
// - WHIP 0.20 차이 ≈ 약 3%p
// - K/9 2.0 차이 ≈ 약 2%p
// 합치면 한 매치에서 선발 영향이 60% 안팎. 따라서 적당히 보수적으로 가중.
//
// 참고 표본: MLB 시즌 162경기 × 30팀 통계 분석 (FanGraphs / Baseball-Reference).

interface StarterStats {
  era?: number;
  whip?: number;
  k9?: number;
  /** 등판 수 — 신뢰도 가중에 사용 */
  gs?: number;
  /** 최근 3등판 ERA (ER·IP 합산) — KBO 만 가중 (RECENT_ERA_WEIGHT 참조) */
  recentEra?: number;
}

// 최근 3등판 ERA 블렌드 가중 (리그별) — 2026-06-10 walk-forward 백테스트:
//   KBO n=125: w=0.35 에서 Brier 0.4860→0.4838, 적중률 59.2→60.0%,
//             Strong Pick 60.7→66.7% 모두 개선 (w 스윕 0~0.8 중 적중률 피크).
//   MLB n=777: w=0.1 부터 단조 악화 (Brier 0.5115→0.5126~0.5237) — 미적용.
//   NPB n=52/82 (2026-07-02, scripts/_backtest-npb-recent-era.ts — DB 스냅샷 차분 복원):
//             3등판 기준 w=0.2 +1픽·2등판 완화 기준 w=0.35 적중률 악화(56.1→53.7%)로
//             일관성 없음 — 미적용. 스냅샷 커버리지 늘어난 뒤(8월~) 재검.
//   양쪽 선발 모두 recentEra 있을 때만 블렌드 (한쪽만 있으면 비대칭 편향).
const RECENT_ERA_WEIGHT: Record<string, number> = {
  KBO: 0.35,
};

export interface StarterAdjustment {
  /** 홈 winProb 에 더할 보정값 (음수면 감소). 일반적으로 -0.20 ~ +0.20 */
  homeShift: number;
  /** 양 팀 expected runs 차이 보정 — 핸디·OU 에 사용 */
  marginShift: number;
  /** 양 팀 expected total runs 보정 — OU 에 사용 */
  totalShift: number;
  /** 보정 사용 가능 여부 (양쪽 ERA 모두 있어야) */
  applied: boolean;
}

/**
 * 양 선발 통계 비교 → 보정값 산출.
 *
 * - homeShift: 홈 선발이 우세하면 양수, 어웨이 선발이 우세하면 음수.
 *   3개 지표(ERA·WHIP·K9) 모두 활용, 시즌 초반 표본(GS<5)은 weight 절반.
 * - marginShift: 홈 expected runs - 어웨이 expected runs 에 더할 보정.
 *   ERA 가 낮으면 그 팀이 적게 실점 → 어웨이 ERA 낮으면 홈 득점 ↓.
 * - totalShift: 양 선발 평균 ERA 가 높으면 totalRuns 증가.
 * - league 전달 시 RECENT_ERA_WEIGHT 리그(현재 KBO)는 시즌 ERA 에
 *   최근 3등판 ERA 를 블렌드 (백테스트 통과분만 — 파일 상단 주석).
 */
export function computeStarterAdjustment(
  homeStarter: StarterStats | null,
  awayStarter: StarterStats | null,
  league?: string,
): StarterAdjustment {
  const empty: StarterAdjustment = {
    homeShift: 0,
    marginShift: 0,
    totalShift: 0,
    applied: false,
  };
  if (!homeStarter?.era || !awayStarter?.era) return empty;

  // 표본 신뢰도 — GS 5경기 미만이면 weight 0.5
  const minGs = Math.min(homeStarter.gs ?? 99, awayStarter.gs ?? 99);
  const weight = minGs < 5 ? 0.5 : 1.0;

  // 최근 3등판 폼 블렌드 — 해당 리그 + 양쪽 모두 recentEra 있을 때만
  const recentW = league ? (RECENT_ERA_WEIGHT[league] ?? 0) : 0;
  const useRecent =
    recentW > 0 &&
    homeStarter.recentEra != null &&
    awayStarter.recentEra != null;
  const effHomeEra = useRecent
    ? (1 - recentW) * homeStarter.era + recentW * homeStarter.recentEra!
    : homeStarter.era;
  const effAwayEra = useRecent
    ? (1 - recentW) * awayStarter.era + recentW * awayStarter.recentEra!
    : awayStarter.era;

  // ERA 차이 (어웨이 - 홈) — 양수면 홈 우세 (홈 선발 ERA 낮음)
  const eraDiff = effAwayEra - effHomeEra;
  // WHIP / K9 보조 — 작은 가중치
  const whipDiff =
    homeStarter.whip != null && awayStarter.whip != null
      ? awayStarter.whip - homeStarter.whip
      : 0;
  const k9Diff =
    homeStarter.k9 != null && awayStarter.k9 != null
      ? homeStarter.k9 - awayStarter.k9 // K/9 는 높을수록 좋음
      : 0;

  // 가중치 (위 통계 근거 기반):
  // ERA 1.0 차이 → 5%p, WHIP 0.20 → 3%p, K9 2.0 → 2%p
  const homeShiftRaw =
    eraDiff * 0.05 + whipDiff * 0.15 + k9Diff * 0.01;
  const homeShift = Math.max(-0.18, Math.min(0.18, homeShiftRaw)) * weight;

  // 마진 보정 — ERA 차이가 큰 만큼 expected runs 차이가 큼
  // 0.5 점/매치 가량 (ERA 1.0 차이당)
  // 핸디·OU 는 1X2 백테스트로 검증 안 된 시장 — recentEra 블렌드 없이 시즌 ERA 만 사용
  const marginShift = (awayStarter.era - homeStarter.era) * 0.5 * weight;

  // 총합 — 양 선발 ERA 평균이 4.50 (리그 평균) 이면 0, 그보다 높으면 totalRuns 증가
  const avgEra = (homeStarter.era + awayStarter.era) / 2;
  const totalShift = (avgEra - 4.5) * 0.4 * weight;

  return {
    homeShift,
    marginShift,
    totalShift,
    applied: true,
  };
}

/** WinProb 에 보정 적용 (homeShift 만큼 home↔away 이동). */
export function applyStarterToWinProb(
  base: { home: number; draw: number; away: number },
  adj: StarterAdjustment,
): { home: number; draw: number; away: number } {
  if (!adj.applied) return base;
  const shift = adj.homeShift;
  const home = Math.max(0.02, Math.min(0.96, base.home + shift));
  const away = Math.max(0.02, Math.min(0.96, base.away - shift));
  // 총합 1 로 정규화 (draw 는 그대로 유지)
  const sum = home + away + base.draw;
  return {
    home: home / sum,
    draw: base.draw / sum,
    away: away / sum,
  };
}
