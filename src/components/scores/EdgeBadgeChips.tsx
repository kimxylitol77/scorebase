// 요소 우세 칩 — 한 팀 쪽에 붙는 "선발 우세·불펜 여유·골리 우세·모델 우위·순위 우세" 작은 배지. hover 로 근거 수치.
import type { EdgeBadge, EdgeKey, EdgeSide } from "@/lib/scores/edge-badges";

const TONE: Record<EdgeKey, string> = {
  starter: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  bullpen: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  goalie: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  model: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  rank: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
};

export default function EdgeBadgeChips({
  badges,
  side,
  className = "",
  max = 3,
}: {
  badges: EdgeBadge[];
  side: EdgeSide;
  className?: string;
  /** 축구 행처럼 좁은 칸은 1개만 */
  max?: number;
}) {
  const mine = badges.filter((b) => b.side === side).slice(0, max);
  if (mine.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center justify-center gap-0.5 ${className}`}>
      {mine.map((b) => (
        <span
          key={b.key}
          title={b.title}
          className={`inline-flex items-center rounded px-1 py-px text-[9px] font-bold leading-tight whitespace-nowrap ${TONE[b.key]}`}
        >
          {b.label}
        </span>
      ))}
    </span>
  );
}
