// scores__RecentFormDots (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type { FormResult } from "@/lib/predict/recent-form";

interface Props {
  form: FormResult[];
  size?: "sm" | "md";
  /** 최근 = 오른쪽 (default), 또는 왼쪽 */
  recentSide?: "right" | "left";
}

const COLORS: Record<FormResult, { bg: string; label: string }> = {
  W: { bg: "bg-emerald-500", label: "W" },
  D: { bg: "bg-neutral-400 dark:bg-neutral-500", label: "D" },
  L: { bg: "bg-rose-500", label: "L" },
};

export default function RecentFormDots({ form, size = "sm", recentSide = "right" }: Props) {
  if (!form || form.length === 0) return null;
  const ordered = recentSide === "left" ? [...form].reverse() : form;
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-4 h-4 text-[9px]";

  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`Last ${form.length} match form`}>
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
