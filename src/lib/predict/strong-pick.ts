// Strong Pick 임계 — 단일 0.65 대신 리그별 상수 (2026-07-02 walk-forward 70/30 재산정).
//
// 배경: 2026-06-17 home calibration 배포가 확률 스케일을 0.5 쪽으로 수축시켜, 고정 0.65
// 로는 야구 Strong Pick 이 사실상 소멸했다(MLB 배포 후 2주 n=9). 리그별 재산정 검증치:
//   MLB 0.58 → test 121건 60.3% (현행 0.65: 21건 52.4%)
//   NPB 0.56 → test 52건 59.6%
//   NBA 0.75 (상향) → test 149건 83.2% (임계곡선 0.5→0.75 단조 증가)
// 그 외 리그(축구·NHL·KBO 등)는 하향 시 test 붕괴 또는 개선 없음 → 현행 0.65 유지.
// 갱신 규칙: calibration 계수를 바꾸면 이 임계도 같은 walk-forward 로 재산정할 것.

const LEAGUE_THRESHOLD: Record<string, number> = {
  MLB: 0.58,
  NPB: 0.56,
  NBA: 0.75,
};

export const DEFAULT_STRONG_PICK_THRESHOLD = 0.65;

/** 리그별 Strong Pick 임계 (미지정 리그는 0.65). */
export function strongPickThreshold(league: string | null | undefined): number {
  return (league && LEAGUE_THRESHOLD[league]) || DEFAULT_STRONG_PICK_THRESHOLD;
}

/** 최고 확률이 리그 임계를 넘는지 — Strong Pick 판정의 단일 소스. */
export function isStrongPickProb(
  league: string | null | undefined,
  topProb: number,
): boolean {
  return topProb >= strongPickThreshold(league);
}
