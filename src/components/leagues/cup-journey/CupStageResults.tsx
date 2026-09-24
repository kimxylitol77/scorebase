"use client";
// 대회 여정 아래 라운드별 결과 — 라운드 토글 + 결과 목록(길면 접는다). 모든 라운드가 HTML 에 실린다.
import { useState } from "react";
import Link from "next/link";

export interface StageResultRow {
  id: number;
  href: string;
  when: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  pk: { home: number; away: number } | null;
}
export interface StageResultsView {
  key: string;
  label: string;
  rows: StageResultRow[];
}

const FOLD = 12;

export default function CupStageResults({ stages, initial }: { stages: StageResultsView[]; initial: string }) {
  const [active, setActive] = useState(initial);
  const [open, setOpen] = useState(false);
  const cur = stages.find((s) => s.key === active) ?? stages[stages.length - 1];
  const rows = open ? cur.rows : cur.rows.slice(0, FOLD);

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-xl font-black tracking-tight text-zinc-950 dark:text-white">라운드별 결과</h3>
        <p className="text-[12px] text-zinc-500 dark:text-white/50">한국시간 · 최근 경기부터</p>
      </div>
      <div role="group" aria-label="라운드" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10 sm:inline-flex">
        {stages.map((s) => {
          const on = s.key === cur.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setActive(s.key); setOpen(false); }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 motion-reduce:transition-none ${
                on
                  ? "bg-white text-zinc-950 shadow-[0_6px_16px_-8px_rgba(244,63,94,0.55)] dark:bg-white/[0.12] dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-white/50 dark:hover:text-white/80"
              }`}
            >
              {s.label}
              <span className={`ml-1 text-[11px] font-semibold tabular-nums ${on ? "text-rose-600 dark:text-rose-400" : "text-zinc-400 dark:text-white/35"}`}>{s.rows.length}</span>
            </button>
          );
        })}
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {rows.map((r) => {
          const homeWin = r.homeScore > r.awayScore || (r.homeScore === r.awayScore && r.pk != null && r.pk.home > r.pk.away);
          const awayWin = r.awayScore > r.homeScore || (r.homeScore === r.awayScore && r.pk != null && r.pk.away > r.pk.home);
          return (
            <li key={r.id}>
              <Link
                href={r.href}
                prefetch={false}
                className="grid grid-cols-[3.2rem_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 ring-1 ring-black/5 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.07]"
              >
                <span className="text-[11px] tabular-nums text-zinc-400 dark:text-white/40">{r.when.split(" ")[0]}</span>
                <span className={`truncate text-right text-[13px] ${homeWin ? "font-bold text-zinc-950 dark:text-white" : "text-zinc-600 dark:text-white/60"}`}>{r.home}</span>
                <span className="text-center text-[13px] font-black tabular-nums text-zinc-900 dark:text-white">
                  {r.homeScore}-{r.awayScore}
                  {r.pk && <span className="block text-[10px] font-semibold text-zinc-400 dark:text-white/40">PK {r.pk.home}-{r.pk.away}</span>}
                </span>
                <span className={`truncate text-[13px] ${awayWin ? "font-bold text-zinc-950 dark:text-white" : "text-zinc-600 dark:text-white/60"}`}>{r.away}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {cur.rows.length > FOLD && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-4 py-2 text-[13px] font-semibold text-rose-600 ring-1 ring-rose-500/30 transition-colors hover:bg-rose-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400"
        >
          {open ? "접기" : `전체 ${cur.rows.length}경기 보기`}
        </button>
      )}
    </div>
  );
}
