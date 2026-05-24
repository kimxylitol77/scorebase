// 최근 경기 결과를 점으로 표시 (W: 초록, D: 회색, L: 빨강).
// 가장 최근 경기가 오른쪽.

import type { FormResult } from "@/lib/predict/types";

interface Props {
  results: FormResult[]; // 최신순 (왼쪽 = 가장 최근). 우리는 시각상 가장 최근이 오른쪽이므로 reverse.
}

const COLORS: Record<FormResult, string> = {
  W: "bg-emerald-500",
  D: "bg-neutral-300 dark:bg-neutral-600",
  L: "bg-red-500",
};

const LABELS: Record<FormResult, string> = {
  W: "승",
  D: "무",
  L: "패",
};

export default function FormDots({ results }: Props) {
  if (results.length === 0) {
    return <span className="text-xs text-neutral-400">데이터 부족</span>;
  }
  // 시각상 오래된 → 최근 (왼쪽 → 오른쪽)
  const visualOrder = [...results].reverse();
  return (
    <div className="inline-flex items-center gap-1">
      {visualOrder.map((r, i) => (
        <span
          key={i}
          className={`w-5 h-5 rounded-full ${COLORS[r]} flex items-center justify-center text-[10px] font-bold text-white`}
          title={LABELS[r]}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
