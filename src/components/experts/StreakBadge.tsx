// 연속 적중(연승) 배지 — 2연승 이상일 때만. 적중률은 승률이 아니라 "연속 적중".
export default function StreakBadge({
  streak,
  className = "",
}: {
  streak: number;
  className?: string;
}) {
  if (streak < 2) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5 ${className}`}
    >
      🔥 {streak}연승
    </span>
  );
}
