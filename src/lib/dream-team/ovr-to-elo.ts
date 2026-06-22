// 드림팀 팀 평균 OVR 을 Elo 레이팅으로 변환 (calcWinProbability 입력용)

export function teamAvgOvr(ovrs: number[]): number {
  if (!ovrs.length) return 50;
  return ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
}

// OVR 50→Elo 1500, 99→Elo 1990. 팀 평균 OVR 차 10 ≈ Elo 100 ≈ 승률 약 64:36.
export function teamOvrToElo(avgOvr: number): number {
  return Math.round(1000 + avgOvr * 10);
}
