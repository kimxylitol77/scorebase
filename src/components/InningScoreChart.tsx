// 야구 매치 프리뷰 카드 — 이닝별 득점 확률 + 총 예상 득점.
// 모델: src/lib/predict/baseball-poisson.ts (Poisson + Skellam).

import type { InningProb } from "@/lib/predict/baseball-poisson";

interface Props {
  inningProbs: InningProb[];
  awayName: string; // 사이트 표기 (= team1)
  homeName: string; // (= team2)
  totalExpectedRuns: { team1: number; team2: number };
  winProb?: { team1: number; team2: number };
}

export default function InningScoreChart({
  inningProbs,
  awayName,
  homeName,
  totalExpectedRuns,
  winProb,
}: Props) {
  if (!inningProbs?.length) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] p-4 sm:p-5">
      <header className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden>🎯</span>
          <h3 className="font-bold text-sm sm:text-base truncate">
            이닝별 득점 확률
          </h3>
        </div>
        <span className="text-[10px] sm:text-[11px] text-neutral-500 shrink-0">
          모델 추정 · 1점 이상
        </span>
      </header>

      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 [&::-webkit-scrollbar]:hidden">
        <table className="w-full text-xs sm:text-sm border-collapse min-w-[420px]">
          <thead>
            <tr className="text-neutral-500 dark:text-neutral-400">
              <th className="text-left py-1.5 pr-2 font-medium w-10">이닝</th>
              <th className="text-left py-1.5 px-2 font-medium">{awayName}</th>
              <th className="text-left py-1.5 px-2 font-medium">{homeName}</th>
              <th className="text-right py-1.5 pl-2 font-medium w-12">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {inningProbs.map((row) => {
              const t1ScoreProb = 1 - row.team1RunProb[0];
              const t2ScoreProb = 1 - row.team2RunProb[0];
              return (
                <tr key={row.inning}>
                  <td className="py-1.5 pr-2 tabular-nums text-neutral-600 dark:text-neutral-300">
                    {row.inning}회
                  </td>
                  <td className="py-1.5 px-2">
                    <ProbBar pct={t1ScoreProb * 100} color="blue" />
                  </td>
                  <td className="py-1.5 px-2">
                    <ProbBar pct={t2ScoreProb * 100} color="rose" />
                  </td>
                  <td className="py-1.5 pl-2 text-right text-[10px] text-neutral-400">
                    {row.pitcherFactor === "bullpen" ? "불펜" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-baseline justify-between gap-2 text-xs sm:text-sm">
        <div className="text-neutral-500 dark:text-neutral-400">
          예상 총 득점
        </div>
        <div className="tabular-nums font-semibold">
          <span className="text-blue-600 dark:text-blue-400">
            {awayName} {totalExpectedRuns.team1.toFixed(1)}
          </span>
          <span className="mx-1.5 text-neutral-400">·</span>
          <span className="text-rose-600 dark:text-rose-400">
            {homeName} {totalExpectedRuns.team2.toFixed(1)}
          </span>
        </div>
      </footer>

      {winProb && (
        <div className="mt-2 text-[11px] text-neutral-500">
          모델 승률(Skellam): {awayName}{" "}
          <span className="font-semibold tabular-nums">
            {(winProb.team1 * 100).toFixed(0)}%
          </span>{" "}
          / {homeName}{" "}
          <span className="font-semibold tabular-nums">
            {(winProb.team2 * 100).toFixed(0)}%
          </span>
        </div>
      )}
    </section>
  );
}

function ProbBar({ pct, color }: { pct: number; color: "blue" | "rose" }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const bg =
    color === "blue"
      ? "bg-blue-500/80 dark:bg-blue-400/80"
      : "bg-rose-500/80 dark:bg-rose-400/80";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div className={`h-full ${bg}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="tabular-nums text-[11px] font-medium text-neutral-700 dark:text-neutral-200 w-9 text-right">
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}
