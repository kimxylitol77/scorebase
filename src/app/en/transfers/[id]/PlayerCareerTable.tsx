// 커리어 표 (영어판). scripts/en-mirror 로 자동 생성.
"use client";
// 경력 표 — 리그/컵대회/클럽대항전/국가대표팀 서브탭 + 시즌별 대회별 스탯(평점·출전·골·도움·카드) + 합계.
// 데이터 조립은 career-data.ts(server). 여기선 탭 전환·렌더만.
import { useState } from "react";
import type { CareerGroup } from "./career-data";

// 평점 색 — 7.0+ 초록, 6.5+ 앰버, 그 아래 주황.
function ratingCls(r: number | null): string {
  if (r == null) return "text-neutral-400";
  if (r >= 7.0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (r >= 6.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
}

export default function PlayerCareerTable({ groups }: { groups: CareerGroup[] }) {
  const [active, setActive] = useState(groups[0]?.cat);
  const g = groups.find((x) => x.cat === active) ?? groups[0];
  if (!g) return null;

  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3.5 pb-2">
        <h2 className="text-lg font-semibold">Career</h2>
      </div>
      {/* 카테고리 서브탭 */}
      {groups.length > 1 && (
        <div className="flex gap-1.5 px-3 pb-2 flex-wrap">
          {groups.map((grp) => (
            <button
              key={grp.cat}
              onClick={() => setActive(grp.cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                grp.cat === g.cat
                  ? "bg-neutral-800 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/10"
              }`}
            >
              {grp.label}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Season</th>
              <th className="text-left px-2 py-2 font-medium">Club</th>
              <th className="text-left px-2 py-2 font-medium">Competition</th>
              <th className="px-2 py-2 font-medium text-center">Rating</th>
              <th className="px-2 py-2 font-medium text-right">Apps</th>
              <th className="px-2 py-2 font-medium text-right">Goals</th>
              <th className="px-2 py-2 font-medium text-right">Assists</th>
              <th className="px-3 py-2 font-medium text-right">Y/R</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {g.rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2.5 text-xs text-neutral-500 tabular-nums whitespace-nowrap">{r.seasonLabel}</td>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {r.teamLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.teamLogo} alt="" className="w-4 h-4 object-contain shrink-0" />
                    )}
                    <span className="truncate font-medium">{r.teamName}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-1.5 min-w-0 text-neutral-600 dark:text-neutral-300">
                    {r.compFlag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.compFlag} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" />
                    )}
                    <span className="truncate">{r.compName}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-center">
                  {r.rating != null ? (
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(r.rating)}`}>{r.rating.toFixed(1)}</span>
                  ) : (
                    <span className="text-neutral-300 dark:text-neutral-600">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.appearances}</td>
                <td className="px-2 py-2.5 text-right tabular-nums font-bold">{r.goals}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{r.assists}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                  <span className="text-amber-600 dark:text-amber-400">{r.yellow}</span>
                  <span className="text-neutral-300 dark:text-neutral-600"> / </span>
                  <span className="text-rose-600 dark:text-rose-400">{r.red}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-neutral-50 dark:bg-white/[0.03] font-semibold border-t border-black/10 dark:border-white/10">
            <tr>
              <td className="px-3 py-2.5 text-xs" colSpan={3}>Total</td>
              <td className="px-2 py-2.5 text-center">
                {g.total.rating != null ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(g.total.rating)}`}>{g.total.rating.toFixed(1)}</span>
                ) : "—"}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{g.total.appearances}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{g.total.goals}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">{g.total.assists}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                <span className="text-amber-600 dark:text-amber-400">{g.total.yellow}</span>
                <span className="text-neutral-300 dark:text-neutral-600"> / </span>
                <span className="text-rose-600 dark:text-rose-400">{g.total.red}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
