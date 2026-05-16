// 최근 5경기 폼 dot — W (녹) / D (회) / L (적).
// 작은 (size="sm") · 일반 (size="md") 두 사이즈.

import type { FormResult } from "@/lib/predict/recent-form";

interface Props {
  form: FormResult[];
  size?: "sm" | "md";
  /** 최근 = 오른쪽 (default), 또는 왼쪽 */
  recentSide?: "right" | "left";
}

const COLORS: Record<FormResult, { bg: string; label: string }> = {
  W: { bg: "bg-emerald-500", label: "승" },
  D: { bg: "bg-neutral-400 dark:bg-neutral-500", label: "무" },
  L: { bg: "bg-rose-500", label: "패" },
};

export default function RecentFormDots({ form, size = "sm", recentSide = "right" }: Props) {
  if (!form || form.length === 0) return null;
  const ordered = recentSide === "left" ? [...form].reverse() : form;
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-4 h-4 text-[9px]";

  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`최근 ${form.length}경기 폼`}>
      {ordered.map((r, i) => {
        const c = COLORS[r];
        return (
          <span
            key={i}
            title={c.label}
            className={`${dim} ${c.bg} rounded-full inline-flex items-center justify-center text-white font-bold`}
          >
            {size === "md" ? r : ""}
          </span>
        );
      })}
    </div>
  );
}
