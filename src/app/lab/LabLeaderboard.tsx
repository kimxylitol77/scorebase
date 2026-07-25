"use client";
// /lab 봇 리더보드 UI — 기간 탭(7일/30일/전체) 전환 + 적중률·표본 비교, 표본 부족 봇은 순위 제외 표기.
import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import type { LeaderboardBot, LeaderboardPeriod } from "./leaderboard";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "d7", label: "최근 7일" },
  { key: "d30", label: "최근 30일" },
  { key: "all", label: "전체" },
];

const card =
  "rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] sm:rounded-[2rem] sm:p-6 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";

function leagueLabel(league: string): string {
  return league === "ALL" ? "전체 리그" : league.replace(/_/g, " ");
}

export default function LabLeaderboard({
  bots,
  minN,
}: {
  bots: LeaderboardBot[];
  minN: number;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");

  const { ranked, small } = useMemo(() => {
    const rows = bots
      .map((b) => {
        const { n, hits } = b.stats[period];
        return { ...b, n, hits, acc: n > 0 ? hits / n : 0 };
      })
      .filter((r) => r.n > 0);
    const ranked = rows
      .filter((r) => r.n >= minN)
      .sort((a, b) => b.acc - a.acc || b.n - a.n);
    const small = rows
      .filter((r) => r.n < minN)
      .sort((a, b) => b.n - a.n);
    return { ranked, small };
  }, [bots, period, minN]);

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-white">
          <Trophy className="h-4 w-4 text-amber-500" aria-hidden /> 봇 리더보드
        </h2>
        <div className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/10" role="tablist" aria-label="기간 선택">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                period === p.key
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-white/20 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-white/50 dark:hover:text-white/75"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {ranked.length === 0 && small.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-white/50">
          이 기간에 채점 완료된 봇 픽이 아직 없습니다. 봇을 저장하면 매일 자동 픽이 쌓이고 경기
          종료 후 채점됩니다.
        </p>
      ) : (
        <>
          {ranked.length > 0 && (
            <ol className="mt-4 space-y-2">
              {ranked.map((r, i) => (
                <li
                  key={r.botId}
                  className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10"
                >
                  <span
                    className={`w-7 shrink-0 text-center text-sm font-black tabular-nums ${
                      i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-orange-400" : "text-zinc-400 dark:text-white/40"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-zinc-900 dark:text-white">{r.name}</p>
                    <p className="truncate text-[11px] text-zinc-500 dark:text-white/45">
                      {r.owner} · {leagueLabel(r.league)}
                    </p>
                  </div>
                  <div className="hidden w-28 sm:block" aria-hidden>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${Math.round(r.acc * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-black tabular-nums text-violet-600 dark:text-violet-400">
                      {(r.acc * 100).toFixed(1)}%
                    </p>
                    <p className="text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
                      {r.hits}/{r.n}경기
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {small.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-zinc-400 dark:text-white/35">
                표본 부족 — 채점 {minN}경기 미만이라 순위에서 제외
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {small.map((r) => (
                  <li
                    key={r.botId}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2 opacity-60 ring-1 ring-black/5 dark:ring-white/10"
                  >
                    <span className="w-7 shrink-0 text-center text-sm text-zinc-300 dark:text-white/25">—</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-700 dark:text-white/70">{r.name}</p>
                      <p className="truncate text-[11px] text-zinc-500 dark:text-white/45">
                        {r.owner} · {leagueLabel(r.league)}
                      </p>
                    </div>
                    <p className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
                      {r.hits}/{r.n}경기
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400 break-keep dark:text-white/35">
        적중률은 채점 완료된 1X2 자동 픽 기준이며 기간은 픽 생성일로 나눕니다. 채점 {minN}경기
        미만인 봇은 순위 왜곡 방지를 위해 순위 밖에 표기합니다.
      </p>
    </section>
  );
}
