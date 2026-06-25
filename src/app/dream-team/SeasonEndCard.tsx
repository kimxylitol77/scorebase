// 드림팀 시즌 정산 카드 — 최종 순위·전적·보너스·승급 + 최종 순위표
import type { SeasonEndResult } from "./play/actions";
import StandingsTable from "./StandingsTable";

export default function SeasonEndCard({ r }: { r: SeasonEndResult }) {
  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-white/[0.04]">
      <div className="text-center">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ring-1 ${r.champion ? "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-300" : "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-300"}`}>
          시즌 {r.seasonNo} 종료
        </span>
        <div className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">
          {r.champion ? "우승!" : `최종 ${r.rank}위`}
        </div>
        <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {r.total}팀 중 {r.rank}위 · {r.record.w}승 {r.record.d}무 {r.record.l}패
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-2.5 text-sm dark:border-neutral-800">
        <span className="text-neutral-500 dark:text-neutral-400">순위 보너스</span>
        <span className="font-medium text-neutral-900 dark:text-white">
          +€{r.bonus}M · 누적 €{r.pointsAfter}M
        </span>
      </div>
      {r.promoted && (
        <div className="mt-2 rounded-lg bg-rose-500/10 px-4 py-2.5 text-center text-sm font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300">
          승급! {r.newTierName} 리그로 올라갔습니다 · 예산 확대
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">최종 순위표</div>
        <StandingsTable rows={r.standings} />
      </div>
      <p className="mt-3 text-center text-sm text-neutral-500 dark:text-neutral-400">새 시즌이 시작됐습니다. 아래에서 다음 경기를 치르세요.</p>
    </div>
  );
}
