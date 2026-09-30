// 플레이오프·시리즈 확률용 Elo 보정 — 공용 Elo 는 폭이 넓어(NHL 1위 vs 평균 홈 승률 0.86) 시즌·시리즈를 굴리면 과신한다.
// 순서는 두고 표준편차를 종목 실측 승률 범위로 맞춘다. 플레이오프 확률판(playoff-sim)과 KBO·NPB 대진표가 같은 값을 쓴다.
import type { Sport } from "./engine";

export const CALIB: Record<Sport, { sd: number; home: number; draw: number }> = {
  baseball: { sd: 40, home: 24, draw: 0 },
  hockey: { sd: 40, home: 35, draw: 0 },
  basketball: { sd: 70, home: 55, draw: 0 },
  soccer: { sd: 55, home: 60, draw: 0.25 },
};

/** 팀별 원 Elo → 보정 Elo. z 는 ±2 로 자른다(팀 수 적은 리그에서 한 팀이 튀는 것 방지) */
export function calibrateElo(raw: Map<number, number>, sport: Sport): Map<number, number> {
  const vals = [...raw.values()];
  if (vals.length === 0) return new Map();
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / vals.length) || 1;
  const c = CALIB[sport];
  return new Map([...raw].map(([id, e]) => [id, 1500 + Math.max(-2, Math.min(2, (e - mean) / sd)) * c.sd]));
}
