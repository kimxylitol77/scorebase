// 하키 경기 평점 — TheSports 는 하키 평점을 주지 않아 자체 계산한다.
// 근거: NHL Game Score(Dom Luszczyszyn) 중 우리 데이터로 가능한 항만 쓴다.
//   스케이터 = 0.75·골 + 0.625·도움(1·2차 도움 가중 0.7·0.55 평균) + 0.075·유효슛 + 0.05·블록 − 0.075·PIM(2분=반칙 1회 −0.15) + 0.15·(+/-)
//   골리     = −0.75·실점 + 0.1·세이브
// 빠진 항: 반칙 유도·페이스오프 승패 수·코르시(ts 미제공). 10점 척도 변환은 6.3 + 1.2·GS (3.0~10.0), 축구 평점 색과 같은 구간.

export function skaterRating(s: { g: number; a: number; sog: number; blk: number; pim: number; pm: number }): number {
  const gs = 0.75 * s.g + 0.625 * s.a + 0.075 * s.sog + 0.05 * s.blk - 0.075 * s.pim + 0.15 * s.pm;
  return toTen(gs);
}

export function goalieRating(saves: number, goalsAgainst: number): number {
  return toTen(-0.75 * goalsAgainst + 0.1 * saves);
}

function toTen(gs: number): number {
  return Math.round(Math.min(10, Math.max(3, 6.3 + 1.2 * gs)) * 10) / 10;
}

/** 평점 색 — 축구 라인업(SoccerLineupSvg ratingColor)과 같은 구간 */
export function ratingColor(r: number): string {
  if (r >= 8.5) return "#7c3aed";
  if (r >= 7.5) return "#15803d";
  if (r >= 7.0) return "#22c55e";
  if (r >= 6.5) return "#84cc16";
  if (r >= 6.0) return "#eab308";
  return "#ef4444";
}
