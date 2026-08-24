// predictions__TeamFormBadges (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

interface FormItem {
  result: "W" | "D" | "L";
  /** 매치 시작 시간 — tooltip 표시용 (선택). */
  startTime?: Date;
}

interface Props {
  /** 최근 N경기 — 보통 최대 5. 0개면 컴포넌트 자체를 숨김. */
  form: FormItem[];
}

const BADGE_CLASS: Record<"W" | "D" | "L", string> = {
  W: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30",
  D: "bg-neutral-400/15 text-neutral-700 dark:bg-neutral-400/20 dark:text-neutral-300 border border-neutral-400/30",
  L: "bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/30",
};

export default function TeamFormBadges({ form }: Props) {
  if (!form || form.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {form.map((f, i) => (
        <span
          key={i}
          className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold leading-none tabular-nums ${BADGE_CLASS[f.result]}`}
          title={
            f.startTime
              ? `${f.startTime.toLocaleDateString("en-GB", { month: "2-digit", day: "2-digit" })} — ${f.result === "W" ? "W" : f.result === "D" ? "D" : "L"}`
              : f.result
          }
        >
          {f.result}
        </span>
      ))}
    </span>
  );
}
