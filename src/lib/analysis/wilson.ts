// Wilson 점수 하한 — 표본이 적은 적중률을 보정해 정렬한다. server-only 인 ranking.ts 와 분리해 순수 모듈로(테스트·클라이언트 공용).
// Wilson score 신뢰구간 하한(95%) — 표본이 적으면 적중률을 보정해 내린다.
// 예: 1/1=0.21, 3/3=0.44, 7/10=0.40, 35/50=0.56, 70/100=0.60.
// 단순 적중률(hit/total) 정렬 시 "1경기 100% 가 매일 1등" 되는 문제를 해결.
export function wilsonLower(hit: number, total: number): number {
  if (total <= 0) return 0;
  const z = 1.96;
  const p = hit / total;
  const denom = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (center - margin) / denom;
}
