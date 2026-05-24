// LoL / e스포츠 매치 카드의 시리즈 진행 표시 (BO3 / BO5).

export interface EsportsContext {
  /** 3 또는 5 */
  bestOf?: 3 | 5 | null;
  /** 현재 진행 중 게임 (1 부터) */
  currentGame?: number | null;
  /** 시리즈 스코어 */
  series?: { home: number; away: number } | null;
}

interface Props {
  ctx: EsportsContext;
  awayLabel: string;
  homeLabel: string;
}

export default function EsportsMiniBoard({ ctx, awayLabel, homeLabel }: Props) {
  const { bestOf, currentGame, series } = ctx;
  if (!bestOf && !series) return null;

  const total = bestOf ?? 3;
  const need = Math.ceil(total / 2);
  const dots = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between text-neutral-500">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
          BO{total} · {currentGame ? `${currentGame}게임 진행` : "시리즈"}
        </span>
        <span className="text-[10px] text-neutral-400">
          {need}승 필요
        </span>
      </div>
      <div className="space-y-1">
        <SeriesRow
          label={awayLabel}
          score={series?.away ?? 0}
          slots={dots}
          currentGame={currentGame}
        />
        <SeriesRow
          label={homeLabel}
          score={series?.home ?? 0}
          slots={dots}
          currentGame={currentGame}
        />
      </div>
    </div>
  );
}

function SeriesRow({
  label,
  score,
  slots,
  currentGame,
}: {
  label: string;
  score: number;
  slots: number[];
  currentGame?: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-neutral-600 dark:text-neutral-400 w-12 truncate">
        {label}
      </span>
      <div className="flex gap-1 flex-1">
        {slots.map((n) => {
          const won = n <= score;
          const isNow = n === currentGame;
          return (
            <span
              key={n}
              className={`inline-block w-2 h-2 rounded-full ${
                won
                  ? "bg-cyan-500"
                  : isNow
                    ? "bg-cyan-300 dark:bg-cyan-400/60 animate-pulse"
                    : "bg-neutral-200 dark:bg-neutral-700"
              }`}
            />
          );
        })}
      </div>
      <span className="font-bold tabular-nums text-neutral-700 dark:text-neutral-300 w-3 text-right">
        {score}
      </span>
    </div>
  );
}
