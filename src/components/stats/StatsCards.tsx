// 선수 카드 뷰 — databallr Showcase 문법. 순위 배지·사진·이름·헤드라인 3지표(값+백분위 막대).
import Link from "next/link";
import { formatStat, type StatColumn, type StatUnit } from "@/lib/sports/baseball/stats-table";
import type { StatsViewRow } from "./types";

export default function StatsCards({ rows, cols, unit, startRank = 1 }: { rows: StatsViewRow[]; cols: StatColumn[]; unit: StatUnit; startRank?: number }) {
  const headline = cols.filter((c) => c.headline).slice(0, 3);
  const use = headline.length ? headline : cols.slice(1, 4);
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((r, i) => (
        <article key={r.key} className={`relative overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none ${r.qualified ? "" : "opacity-70"}`}>
          <span className="absolute left-2 top-2 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white dark:bg-white dark:text-neutral-900">{startRank + i}</span>
          <div className="mx-auto h-16 w-16 overflow-hidden rounded-full bg-neutral-100 ring-2 ring-white dark:bg-white/10 dark:ring-white/10">
            {r.photo ? <img src={r.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" /> : <span className="flex h-full w-full items-center justify-center text-lg font-bold text-neutral-400">{r.name.slice(0, 1)}</span>}
          </div>
          <div className="mt-2 text-center leading-tight">
            <div className="truncate text-sm font-bold">{r.href ? <Link href={r.href} className="hover:underline underline-offset-4">{r.name}</Link> : r.name}</div>
            <div className="truncate text-[10px] text-neutral-500">{r.sub}{!r.qualified && " · 규정 미달"}</div>
          </div>
          <dl className="mt-2.5 space-y-1.5">
            {use.map((c) => {
              const cell = r.cells[c.key];
              return (
                <div key={c.key}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <dt className="font-semibold text-neutral-500">{c.label}</dt>
                    <dd className="font-bold tabular-nums">{formatStat(cell?.value ?? null, c, unit)} <span className="text-[10px] font-normal text-neutral-400">{cell?.pct ?? "—"}</span></dd>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10"><div className="h-full rounded-full bg-rose-500/80 dark:bg-rose-400/80" style={{ width: `${cell?.pct ?? 0}%` }} /></div>
                </div>
              );
            })}
          </dl>
        </article>
      ))}
    </div>
  );
}
