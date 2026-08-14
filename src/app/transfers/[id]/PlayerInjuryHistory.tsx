// 부상 이력 표 — TheSports 부상 기록 + API-Football 플래그 합집합(injury-data.ts). 사유·기간·결장수.
import type { InjurySpell } from "./injury-data";

function fmt(d: string): string {
  return d.replace(/-/g, ".");
}

export default function PlayerInjuryHistory({ spells }: { spells: InjurySpell[] }) {
  if (!spells.length) return null;
  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">부상 이력</h2>
        <span className="text-[11px] text-neutral-500">{spells.length}건</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">사유</th>
            <th className="text-left px-2 py-2 font-medium">기간</th>
            <th className="text-right px-4 py-2 font-medium">결장</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {spells.map((s, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5 font-medium">
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${s.ongoing ? "bg-red-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
                  <span>{s.reason}</span>
                  {s.ongoing && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">진행중</span>}
                </span>
              </td>
              <td className="px-2 py-2.5 text-xs text-neutral-500 tabular-nums whitespace-nowrap">
                {s.from === s.to ? fmt(s.from) : `${fmt(s.from)} ~ ${fmt(s.to)}`}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{s.games}경기</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[11px] text-neutral-400">
        TheSports 부상 기록 + API-Football 결장·의심 기록. 정지(경고 누적)는 제외.
      </p>
    </section>
  );
}
