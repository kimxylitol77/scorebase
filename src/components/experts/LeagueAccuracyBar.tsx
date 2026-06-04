import type { LeagueAccuracy } from "@/lib/analysis/profile";

// 리그별 정확도 막대 1줄. 표본 3건 미만은 흐리게 + 신뢰도 낮음 표시(숨기지 않되 구분).
export default function LeagueAccuracyBar({ item }: { item: LeagueAccuracy }) {
  const faint = item.total < 3;
  return (
    <div className={faint ? "opacity-50" : ""}>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-semibold">{item.label}</span>
        <span className="text-neutral-500">
          <strong className="text-emerald-600 dark:text-emerald-400">{item.rate}%</strong>{" "}
          <span className="text-[11px] text-neutral-400">
            ({item.hit}/{item.total})
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.max(item.rate, 2)}%` }}
        />
      </div>
    </div>
  );
}
