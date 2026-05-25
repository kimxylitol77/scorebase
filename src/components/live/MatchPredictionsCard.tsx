// api-football /predictions 기반 매치 예측 카드.
// /live/[league]/[gameId] 에서 리그 standings 없는 매치(친선/예선 등) 의
// 정보 빈약 문제를 보완 — winner 예측 + 확률 % + form/att/def/h2h 비교.

import type { MatchPrediction } from "@/lib/sports/api-football-extras";

interface Props {
  prediction: MatchPrediction;
  homeNameKo: string;
  awayNameKo: string;
}

function Bar({ home, away, label }: { home: number; away: number; label: string }) {
  const sum = home + away;
  const hPct = sum > 0 ? (home / sum) * 100 : 50;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span className="font-medium text-blue-600 dark:text-blue-400">{home}%</span>
        <span>{label}</span>
        <span className="font-medium text-rose-600 dark:text-rose-400">{away}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-900">
        <div className="bg-blue-500/70 dark:bg-blue-400/70" style={{ width: `${hPct}%` }} />
        <div className="bg-rose-500/70 dark:bg-rose-400/70" style={{ width: `${100 - hPct}%` }} />
      </div>
    </div>
  );
}

export default function MatchPredictionsCard({ prediction, homeNameKo, awayNameKo }: Props) {
  const { percent, comparison, winnerName, advice } = prediction;
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">매치 예측</h2>
        <span className="text-[10px] text-neutral-400">api-football</span>
      </header>

      {/* 승부 확률 % */}
      <div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-2">
            <div className="text-[11px] text-neutral-500">{homeNameKo}</div>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400">{percent.home}%</div>
          </div>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-2 py-2">
            <div className="text-[11px] text-neutral-500">무</div>
            <div className="text-xl font-black text-neutral-600 dark:text-neutral-300">{percent.draw}%</div>
          </div>
          <div className="rounded-lg border border-rose-200 dark:border-rose-800/40 bg-rose-50/50 dark:bg-rose-950/20 px-2 py-2">
            <div className="text-[11px] text-neutral-500">{awayNameKo}</div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400">{percent.away}%</div>
          </div>
        </div>
        {winnerName && (
          <p className="mt-2 text-[11px] text-neutral-500 text-center">
            예상 승자: <span className="font-medium text-neutral-700 dark:text-neutral-200">{winnerName}</span>
          </p>
        )}
      </div>

      {/* 비교 메트릭 */}
      <div className="space-y-2">
        <Bar home={comparison.form.home} away={comparison.form.away} label="폼" />
        <Bar home={comparison.att.home} away={comparison.att.away} label="공격" />
        <Bar home={comparison.def.home} away={comparison.def.away} label="수비" />
        <Bar home={comparison.h2h.home} away={comparison.h2h.away} label="상대전적" />
        <Bar home={comparison.goals.home} away={comparison.goals.away} label="득점력" />
      </div>

      {advice && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400 italic border-l-2 border-amber-400 pl-2">
          {advice}
        </p>
      )}
    </section>
  );
}
