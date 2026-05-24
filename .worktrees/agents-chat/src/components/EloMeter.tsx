// Elo 점수 + 게이지 (1200~1900 정도 범위로 시각화).

interface Props {
  name: string;
  rating: number; // 보통 1300~1900
  /** 두 팀 비교 시 상대 팀 Elo (게이지에서 우위 표시) */
  opponentRating?: number;
}

const MIN_ELO = 1300;
const MAX_ELO = 1900;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function EloMeter({ name, rating, opponentRating }: Props) {
  const pct =
    ((clamp(rating, MIN_ELO, MAX_ELO) - MIN_ELO) / (MAX_ELO - MIN_ELO)) * 100;

  let trend: "high" | "low" | "neutral" = "neutral";
  if (opponentRating !== undefined) {
    if (rating - opponentRating > 30) trend = "high";
    else if (opponentRating - rating > 30) trend = "low";
  }

  const barColor =
    trend === "high"
      ? "bg-emerald-500"
      : trend === "low"
        ? "bg-neutral-400 dark:bg-neutral-600"
        : "bg-neutral-700 dark:bg-neutral-300";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium truncate">{name}</span>
          <span
            className={`tabular-nums font-bold ${
              trend === "high"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {Math.round(rating)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
