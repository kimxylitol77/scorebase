"use client";
// 라이브 텍스트 중계 피드 — TickerLine[] 를 최신순 스트림으로 렌더 (데이터 파생은 부모 책임).

import type { TickerLine } from "@/lib/live/ticker";

const DOT_CLS: Record<TickerLine["kind"], string> = {
  goal: "bg-emerald-500",
  score: "bg-emerald-500",
  card: "bg-amber-400",
  subst: "bg-sky-400",
  var: "bg-violet-400",
  info: "bg-zinc-300 dark:bg-zinc-600",
};

export default function LiveTickerFeed({
  lines,
  title = "문자 중계",
}: {
  lines: TickerLine[];
  title?: string;
}) {
  if (lines.length === 0) return null;
  const newestFirst = [...lines].reverse();
  return (
    <div className="rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
        <span>{title}</span>
        <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
          자동 생성 · 최신순
        </span>
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {newestFirst.map((l) => (
          <li key={l.key} className="flex items-start gap-2 text-[13px] leading-relaxed">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT_CLS[l.kind]}`} />
            <span className="w-12 shrink-0 text-[11px] font-bold tabular-nums text-zinc-400 dark:text-white/40">
              {l.tag}
            </span>
            <span className="text-zinc-700 dark:text-white/80">{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
