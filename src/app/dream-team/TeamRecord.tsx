// 드림팀 전적·최근 경기 카드 — 빌더·경기 페이지 공용
import { TIERS } from "@/lib/dream-team/tiers";

interface MatchEntry {
  opp: string;
  my: number;
  op: number;
  outcome: string;
  ts: number;
}

interface Props {
  tier: string;
  rating: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  matchLog: MatchEntry[];
}

export default function TeamRecord({ tier, rating, wins, draws, losses, points, matchLog }: Props) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium text-neutral-900 dark:text-white">{TIERS[tier]?.name ?? tier}</span>
          <span className="text-neutral-400"> · </span>
          <span className="text-neutral-600 dark:text-neutral-300">레이팅 {rating}</span>
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{wins}승</span> {draws}무 <span className="font-medium text-rose-600 dark:text-rose-400">{losses}패</span> · 자금 €{points}M
        </div>
      </div>

      {matchLog.length > 0 ? (
        <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">최근 경기</div>
          <div className="space-y-1">
            {matchLog.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="min-w-0 flex-1 truncate text-neutral-600 dark:text-neutral-300">vs {m.opp}</span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-medium text-neutral-900 dark:text-white">{m.my}-{m.op}</span>
                  <span
                    className={`w-6 text-center text-xs font-medium ${m.outcome === "win" ? "text-emerald-600 dark:text-emerald-400" : m.outcome === "loss" ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}
                  >
                    {m.outcome === "win" ? "승" : m.outcome === "loss" ? "패" : "무"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 border-t border-neutral-100 pt-3 text-center text-xs text-neutral-400 dark:border-neutral-800">
          아직 경기 기록이 없습니다. 경기를 해보세요.
        </div>
      )}
    </div>
  );
}
