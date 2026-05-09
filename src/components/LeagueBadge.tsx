// 리그 표시용 작은 뱃지.

const STYLES: Record<string, string> = {
  EPL: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:ring-purple-500/20",
  NBA: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/20",
  NHL: "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-500/20",
  MLB: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  KBO: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  // 축구 리그 6종
  LALIGA:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  BUNDESLIGA:
    "bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-500/20",
  SERIE_A:
    "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20",
  LIGUE_1:
    "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
  MLS: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20",
  UCL: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20",
};

const FALLBACK =
  "bg-neutral-100 text-neutral-700 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700";

// 리그 표시 라벨 (badge 안에 보일 짧은 이름)
const LABELS: Record<string, string> = {
  EPL: "EPL",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
  KBO: "KBO",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스",
  SERIE_A: "세리에A",
  LIGUE_1: "리그1",
  MLS: "MLS",
  UCL: "챔스",
};

interface Props {
  league: string;
  size?: "sm" | "md";
}

export default function LeagueBadge({ league, size = "sm" }: Props) {
  const cls = STYLES[league] ?? FALLBACK;
  const sizeCls =
    size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  const label = LABELS[league] ?? league;
  return (
    <span
      className={`inline-flex items-center font-semibold tracking-wide ring-1 ring-inset rounded-md ${sizeCls} ${cls}`}
    >
      {label}
    </span>
  );
}
