// NHL 골리 보정 — 1X2 winProb 에 GAA·SV% 가중치.
//
// 통계 근거:
// - GAA 1.0 차이 ≈ 매치당 승률 차이 약 4%p (NHL 골당 가치 큼)
// - SV% 0.020 차이 ≈ 약 3%p
// - 골리 영향은 야구 선발 (60%) 보다는 작음 (~30~40%) 이라 가중치 보수적.

interface GoalieStats {
  gaa?: number;
  savePctg?: number;
  /** 등판 수 — 신뢰도 가중에 사용 */
  gamesPlayed?: number;
}

export interface GoalieAdjustment {
  homeShift: number;
  applied: boolean;
}

export function computeGoalieAdjustment(
  homeGoalie: GoalieStats | null,
  awayGoalie: GoalieStats | null,
): GoalieAdjustment {
  if (!homeGoalie?.gaa || !awayGoalie?.gaa)
    return { homeShift: 0, applied: false };

  const minGp = Math.min(
    homeGoalie.gamesPlayed ?? 99,
    awayGoalie.gamesPlayed ?? 99,
  );
  const weight = minGp < 5 ? 0.5 : 1.0;

  // GAA 차이 (어웨이 - 홈) — 양수면 홈 우세 (홈 골리 GAA 낮음)
  const gaaDiff = awayGoalie.gaa - homeGoalie.gaa;
  // SV% 차이 — 높을수록 좋음
  const svDiff =
    homeGoalie.savePctg != null && awayGoalie.savePctg != null
      ? homeGoalie.savePctg - awayGoalie.savePctg
      : 0;

  // GAA 1.0 → 4%p, SV% 0.020 → 3%p
  const homeShiftRaw = gaaDiff * 0.04 + svDiff * 1.5;
  const homeShift =
    Math.max(-0.14, Math.min(0.14, homeShiftRaw)) * weight;

  return { homeShift, applied: true };
}

export function applyGoalieToWinProb(
  base: { home: number; draw: number; away: number },
  adj: GoalieAdjustment,
): { home: number; draw: number; away: number } {
  if (!adj.applied) return base;
  const shift = adj.homeShift;
  const home = Math.max(0.02, Math.min(0.96, base.home + shift));
  const away = Math.max(0.02, Math.min(0.96, base.away - shift));
  const sum = home + away + base.draw;
  return {
    home: home / sum,
    draw: base.draw / sum,
    away: away / sum,
  };
}
