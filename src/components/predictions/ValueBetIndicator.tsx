// 모델 추정 승률 vs 시장 implied (베팅사이트 odds vig 제거) 차이.
// 차이가 임계값 (기본 5%) 이상이면 Value 배지 표시.
// /predictions 다가오는 경기 표 — ProbBar 옆에 인라인 배치.

interface Props {
  /** 모델 추정 [홈, 무, 원정] — 합 = 1. soccer 아니면 무는 0. */
  modelProbs: [number, number, number];
  /** 시장 implied [홈, 무, 원정] — 합 = 1. odds 없으면 undefined. */
  marketProbs?: [number, number, number] | null;
  /** Value 로 인정할 차이 임계 (확률). 기본 0.05 = 5%p. */
  threshold?: number;
}

export default function ValueBetIndicator({
  modelProbs,
  marketProbs,
  threshold = 0.05,
}: Props) {
  if (!marketProbs) return null;
  const labels: Array<"홈" | "무" | "원정"> = ["홈", "무", "원정"];
  // 모델 - 시장 차이가 가장 큰 양수 (모델이 더 자신 있는 side) 추출.
  let bestSide: 0 | 1 | 2 | null = null;
  let bestDelta = 0;
  for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
    const m = marketProbs[i];
    if (m <= 0) continue;
    const delta = modelProbs[i] - m;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestSide = i;
    }
  }
  if (bestSide === null || bestDelta < threshold) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap"
      title={`모델 ${(modelProbs[bestSide] * 100).toFixed(0)}% vs 시장 ${(marketProbs[bestSide] * 100).toFixed(0)}% — +${(bestDelta * 100).toFixed(1)}%p Value`}
    >
      <span aria-hidden>💡</span>
      <span>Value {labels[bestSide]}</span>
      <span className="tabular-nums opacity-80">+{(bestDelta * 100).toFixed(0)}%</span>
    </span>
  );
}
