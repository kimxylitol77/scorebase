// 용어·산식 설명 — 열 메타(desc)로 생성하는 접이식 목록. databallr "Stats Glossary" 문법.
import { BookOpen } from "lucide-react";
import type { StatColumn } from "@/lib/sports/baseball/stats-table";

export default function StatsGlossary({ cols, note }: { cols: StatColumn[]; note?: string }) {
  const items = cols.filter((c) => c.desc);
  if (items.length === 0) return null;
  return (
    <details className="group mt-3 rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <BookOpen className="h-4 w-4 text-neutral-400" aria-hidden="true" /> 용어·산식 설명
        <span className="ml-auto text-xs font-normal text-neutral-500 group-open:hidden">펼치기</span>
        <span className="ml-auto hidden text-xs font-normal text-neutral-500 group-open:inline">접기</span>
      </summary>
      <dl className="grid gap-x-6 gap-y-2 border-t border-neutral-100 px-4 py-3 text-xs sm:grid-cols-2 dark:border-white/5">
        {items.map((c) => (
          <div key={c.key} className="flex gap-2">
            <dt className="w-16 shrink-0 font-bold text-neutral-700 dark:text-neutral-200">{c.label}</dt>
            <dd className="text-neutral-500 break-keep">{c.desc}{c.lowerIsBetter && <span className="ml-1 text-neutral-400">(낮을수록 상위)</span>}</dd>
          </div>
        ))}
        {note && <div className="col-span-full text-[11px] text-neutral-400 break-keep">{note}</div>}
      </dl>
    </details>
  );
}
