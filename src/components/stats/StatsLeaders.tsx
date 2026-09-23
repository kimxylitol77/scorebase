// 열별 리더 보드 — 규정 선수 중 상위 5명. databallr "Leaders" 뷰 문법.
import Link from "next/link";
import { formatStat, type StatColumn, type StatUnit } from "@/lib/sports/baseball/stats-table";
import type { StatsViewRow } from "./types";

export default function StatsLeaders({ rows, cols, unit, top = 5 }: { rows: StatsViewRow[]; cols: StatColumn[]; unit: StatUnit; top?: number }) {
  const qual = rows.filter((r) => r.qualified);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cols.filter((c) => !c.noLeader).map((c) => {
        const list = qual
          .filter((r) => r.cells[c.key]?.value != null)
          .sort((a, b) => ((a.cells[c.key].value! - b.cells[c.key].value!) * (c.lowerIsBetter ? 1 : -1)) || a.name.localeCompare(b.name, "ko"))
          .slice(0, top);
        if (list.length === 0) return null;
        return (
          <section key={c.key} className="rounded-2xl bg-white p-3 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <h3 className="flex items-baseline justify-between text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">
              {c.label}
              {c.desc && <span className="truncate pl-2 text-[10px] font-normal normal-case tracking-normal text-neutral-400">{c.desc}</span>}
            </h3>
            <ol className="mt-2 divide-y divide-neutral-100 dark:divide-white/5">
              {list.map((r, i) => (
                <li key={r.key} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className={`w-5 text-center text-xs font-bold tabular-nums ${i === 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>{i + 1}</span>
                  <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">{r.photo && <img src={r.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}</span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate font-semibold">{r.href ? <Link href={r.href} className="hover:underline underline-offset-4">{r.name}</Link> : r.name}</span>
                    <span className="block truncate text-[10px] text-neutral-500">{r.sub}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block font-bold">{formatStat(r.cells[c.key].value, c, unit)}</span>
                    <span className="block text-[10px] leading-none text-neutral-400">{r.cells[c.key].pct ?? "—"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
