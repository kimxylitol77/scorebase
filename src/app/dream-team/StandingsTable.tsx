// 드림팀 시즌 순위표 — 나 + 봇 5팀, 승점·득실 정렬 (내 행 강조)
import type { StandRow } from "@/lib/dream-team/season";

export default function StandingsTable({ rows }: { rows: StandRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-white/[0.04]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <th className="py-2 pl-3 pr-1 text-left font-medium">#</th>
            <th className="py-2 px-1 text-left font-medium">팀</th>
            <th className="py-2 px-1 text-center font-medium">경기</th>
            <th className="py-2 px-1 text-center font-medium">승무패</th>
            <th className="py-2 px-1 text-center font-medium">득실</th>
            <th className="py-2 pl-1 pr-3 text-center font-medium">승점</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const gd = r.gf - r.ga;
            return (
              <tr key={r.id} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${r.isMe ? "bg-rose-500/10" : ""}`}>
                <td className="py-2 pl-3 pr-1 text-neutral-400">{i + 1}</td>
                <td className={`py-2 px-1 ${r.isMe ? "font-semibold text-rose-600 dark:text-rose-300" : "text-neutral-800 dark:text-neutral-100"}`}>{r.name}</td>
                <td className="py-2 px-1 text-center text-neutral-500 dark:text-neutral-400">{r.played}</td>
                <td className="py-2 px-1 text-center text-neutral-500 dark:text-neutral-400">
                  {r.w}·{r.d}·{r.l}
                </td>
                <td className="py-2 px-1 text-center text-neutral-500 dark:text-neutral-400">
                  {gd >= 0 ? "+" : ""}
                  {gd}
                </td>
                <td className="py-2 pl-1 pr-3 text-center font-semibold text-neutral-900 dark:text-white">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
