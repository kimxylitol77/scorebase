// 야구 팀 stats 카드 — TheSports detail_live.stats phase 0 (전체) 기반.
// 확정 매핑된 stat_id (안타/타석/타율) 만 표시. 다른 stat_id 는 미확정으로 숨김.

import { extractTeamStats } from "@/lib/sports/thesports/baseball-stats";

interface Props {
  stats: unknown;
  homeNameKo: string;
  awayNameKo: string;
}

function fmt(v: number, decimal: boolean): string {
  if (decimal) return v.toFixed(3);
  return Number.isInteger(v) ? v.toString() : v.toString();
}

export default function BaseballTeamStatsCard({ stats, homeNameKo, awayNameKo }: Props) {
  const rows = extractTeamStats(stats);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">팀 스탯</h2>
        <span className="text-[10px] text-neutral-400">TheSports</span>
      </header>
      <div className="grid grid-cols-3 items-center text-xs font-medium border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
        <div className="text-right text-blue-600 dark:text-blue-400 truncate">{homeNameKo}</div>
        <div className="text-center text-neutral-400"></div>
        <div className="text-left text-rose-600 dark:text-rose-400 truncate">{awayNameKo}</div>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {rows.map((r) => (
          <div key={r.statId} className="grid grid-cols-3 items-center py-2 text-sm">
            <div className="text-right tabular-nums font-bold">{fmt(r.home, r.decimal)}</div>
            <div className="text-center text-xs text-neutral-500">{r.label}</div>
            <div className="text-left tabular-nums font-bold">{fmt(r.away, r.decimal)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
