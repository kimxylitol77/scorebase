"use client";
// 빅매치 허브 하단 — 세그먼트 토글 + 조별 카드 그리드. 모든 세그먼트 데이터가 서버 HTML 에 실리고
// 여기선 보이는 것만 고른다(검색엔진은 전 팀을 본다).
import { useState } from "react";
import Link from "next/link";
import type { HubGroupView, HubSegmentView, HubZone } from "./types";

const ZONE_LABEL: Record<HubZone, string> = {
  qf: "8강 진출권",
  sf: "4강 진출권",
  promo: "승격권",
  qualify: "본선 진출권",
  host: "개최국 자동 진출",
};

export default function GroupSegments({
  segments,
  ariaLabel,
  unplayedNote,
  note,
}: {
  segments: HubSegmentView[];
  ariaLabel: string;
  /** 아직 경기 전일 때만 덧붙이는 안내 */
  unplayedNote: string;
  /** 항상 보이는 안내(조 간 비교로 정해지는 하위권 등) */
  note?: string;
}) {
  const [active, setActive] = useState(segments[0].key);
  const cur = segments.find((s) => s.key === active) ?? segments[0];
  const anyPlayed = cur.groups.some((g) => g.played);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {segments.length > 1 && (
          <div
            role="group"
            aria-label={ariaLabel}
            className="inline-flex max-w-full overflow-x-auto rounded-full bg-zinc-100 p-1 ring-1 ring-black/5 dark:bg-white/[0.05] dark:ring-white/10"
          >
            {segments.map((s) => {
              const on = s.key === active;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActive(s.key)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 motion-reduce:transition-none sm:px-4 ${
                    on
                      ? "bg-white text-zinc-950 shadow-[0_6px_16px_-8px_rgba(244,63,94,0.55)] dark:bg-white/[0.12] dark:text-white"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-white/50 dark:hover:text-white/80"
                  }`}
                >
                  {s.label}
                  <span className={`ml-1 text-[11px] font-semibold tabular-nums ${on ? "text-rose-600 dark:text-rose-400" : "text-zinc-400 dark:text-white/35"}`}>
                    {s.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p className="inline-flex items-center gap-2 text-[13px] text-zinc-600 break-keep dark:text-white/60">
          <span className="h-2.5 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          {cur.rule}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {cur.groups.map((g) => (
          <GroupCard key={`${cur.key}-${g.key}`} g={g} />
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-zinc-500 break-keep dark:text-white/45">
        {anyPlayed ? "" : `${unplayedNote} `}
        {note ?? ""}
      </p>
    </div>
  );
}

function GroupCard({ g }: { g: HubGroupView }) {
  return (
    <article className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.25)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <header className="flex items-baseline justify-between px-5 pt-5">
        <h3 className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-white/40">{g.eyebrow}</span>
          <span className="text-xl font-black tracking-tight text-zinc-950 dark:text-white">{g.title}</span>
        </h3>
      </header>
      <table className="mt-2 w-full text-[13px]">
        <thead>
          <tr className="text-[11px] font-semibold text-zinc-400 dark:text-white/40">
            <th scope="col" className="w-10 py-2 pl-5 text-left font-semibold">#</th>
            <th scope="col" className="py-2 text-left font-semibold">팀</th>
            <th scope="col" className="w-10 py-2 text-right font-semibold">경기</th>
            <th scope="col" className="w-12 py-2 text-right font-semibold">득실</th>
            <th scope="col" className="w-14 py-2 pr-5 text-right font-semibold">승점</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.teamId} className="border-t border-black/[0.04] dark:border-white/[0.06]">
              <td className="relative py-2.5 pl-5 tabular-nums text-zinc-500 dark:text-white/50">
                {r.zone && <span className="absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full bg-emerald-500" aria-hidden />}
                {/* 경기 전 조는 순서가 임의(소스 기본 순서·자체 계산 전원 동률)라 순위 숫자를 내지 않는다 */}
                {g.played ? r.position : <span aria-label="순위 미정">–</span>}
                {r.zone && <span className="sr-only"> ({ZONE_LABEL[r.zone]})</span>}
              </td>
              <td className="py-2.5">
                <Link
                  href={`/teams/${r.teamId}`}
                  prefetch={false}
                  className="flex min-w-0 items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  {r.flag ? (
                    <span className="shrink-0 text-[16px] leading-none" aria-hidden>{r.flag}</span>
                  ) : (
                    <span className="h-3.5 w-[18px] shrink-0 rounded-[3px] bg-zinc-200 dark:bg-white/10" aria-hidden />
                  )}
                  <span className="truncate font-semibold text-zinc-900 transition-colors hover:text-rose-600 dark:text-white/90 dark:hover:text-rose-400">
                    {r.name}
                  </span>
                  {r.badge && (
                    <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                      {r.badge}
                    </span>
                  )}
                </Link>
              </td>
              <td className="py-2.5 text-right tabular-nums text-zinc-500 dark:text-white/50">{r.played}</td>
              <td className="py-2.5 text-right tabular-nums text-zinc-500 dark:text-white/50">
                {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
              </td>
              <td className="py-2.5 pr-5 text-right text-[14px] font-black tabular-nums text-zinc-950 dark:text-white">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {g.next && (
        <Link
          href={g.next.href}
          prefetch={false}
          className="flex items-center justify-between gap-3 border-t border-black/5 bg-zinc-50/70 px-5 py-3 text-[12px] transition-colors hover:bg-zinc-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
        >
          <span className="min-w-0 truncate text-zinc-600 dark:text-white/60">
            <span className={`mr-1.5 font-semibold ${g.next.live ? "text-rose-600 dark:text-rose-400" : "text-zinc-400 dark:text-white/40"}`}>
              {g.next.live ? "진행 중" : "다음 경기"}
            </span>
            {g.next.home} vs {g.next.away}
          </span>
          <span className="shrink-0 tabular-nums text-zinc-500 dark:text-white/50">{g.next.when}</span>
        </Link>
      )}
    </article>
  );
}
