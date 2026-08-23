// FormDots (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type { FormResult } from "@/lib/predict/types";

interface Props {
  results: FormResult[]; // 최신순 (왼쪽 = 가장 최근). 시각상 가장 최근이 오른쪽이므로 reverse.
  size?: "sm" | "md";
}

const STYLES: Record<FormResult, string> = {
  W: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-300/30",
  D: "bg-zinc-100 text-zinc-500 ring-zinc-300 dark:bg-white/10 dark:text-white/65 dark:ring-white/15",
  L: "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-300/30",
};

const LABELS: Record<FormResult, string> = { W: "W", D: "D", L: "L" };

export default function FormDots({ results, size = "sm" }: Props) {
  if (results.length === 0) {
    return <span className="text-xs text-zinc-400 dark:text-white/35">Not enough data</span>;
  }
  const dim = size === "md" ? "h-8 w-8 text-xs" : "h-5 w-5 text-[10px]";
  // 시각상 오래된 → 최근 (왼쪽 → 오른쪽)
  const visualOrder = [...results].reverse();
  return (
    <div className="inline-flex items-center gap-1.5">
      {visualOrder.map((r, i) => (
        <span
          key={i}
          className={`inline-flex items-center justify-center rounded-full font-bold ring-1 ${dim} ${STYLES[r]}`}
          title={LABELS[r]}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
