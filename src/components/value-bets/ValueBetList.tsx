// 밸류 베트 목록(클라이언트) — 배당구간 필터 + 정렬(차이순·켈리 비중·배당 낮은 순·시간순).
// raw edge 정렬만 있으면 고배당 언더독으로만 채워지는 favourite-longshot 편향 (2026-08-22 리뷰 M2).
// 켈리 비중 f = (p·b − (1−p)) / b, b = 배당 − 1. 참고용 지표이며 베팅을 권유하지 않는다.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface ValueBetRow {
  matchId: number;
  href: string;
  leagueLabel: string;
  timeLabel: string;
  /** 정렬용 epoch ms */
  startMs: number;
  homeName: string;
  awayName: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  pickLabel: string;
  valuePct: number;
  eloPct: number;
  impliedPct: number;
  odds: number;
}

type Range = "all" | "fav" | "mid" | "long";
type Sort = "value" | "kelly" | "odds" | "time";

const RANGES: Array<{ key: Range; label: string; test: (o: number) => boolean }> = [
  { key: "all", label: "전체", test: () => true },
  { key: "fav", label: "≤ 2.0", test: (o) => o <= 2.0 },
  { key: "mid", label: "1.5 ~ 3.0", test: (o) => o >= 1.5 && o <= 3.0 },
  { key: "long", label: "> 3.0", test: (o) => o > 3.0 },
];
const SORTS: Array<{ key: Sort; label: string }> = [
  { key: "value", label: "차이순" },
  { key: "kelly", label: "켈리 비중" },
  { key: "odds", label: "배당 낮은 순" },
  { key: "time", label: "시간순" },
];

export function kellyFraction(p: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  return Math.max(0, (p * b - (1 - p)) / b);
}

export default function ValueBetList({ bets }: { bets: ValueBetRow[] }) {
  const [range, setRange] = useState<Range>("all");
  const [sort, setSort] = useState<Sort>("value");
  const rows = useMemo(() => {
    const test = RANGES.find((r) => r.key === range)!.test;
    const list = bets.filter((b) => test(b.odds));
    switch (sort) {
      case "kelly":
        return list.sort((a, b) => kellyFraction(b.eloPct, b.odds) - kellyFraction(a.eloPct, a.odds));
      case "odds":
        return list.sort((a, b) => a.odds - b.odds);
      case "time":
        return list.sort((a, b) => a.startMs - b.startMs);
      default:
        return list.sort((a, b) => b.valuePct - a.valuePct);
    }
  }, [bets, range, sort]);
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
      active
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <div className="flex items-center gap-1.5" role="group" aria-label="배당 구간 필터">
          <span className="text-neutral-500">배당</span>
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key} className={chip(range === r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="정렬">
          <span className="text-neutral-500">정렬</span>
          {SORTS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSort(s.key)} aria-pressed={sort === s.key} className={chip(sort === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-neutral-400 tabular-nums">{rows.length}경기</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 px-4 py-8 text-center text-sm text-neutral-500">
          이 배당 구간에는 밸류 베트가 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="hidden md:grid grid-cols-[100px_90px_minmax(0,1fr)_70px_120px_80px_70px] gap-3 px-4 py-2 text-[10px] font-bold tracking-wider uppercase text-neutral-500 border-b border-black/5 dark:border-white/5">
            <div>리그</div>
            <div>시간</div>
            <div>매치</div>
            <div className="text-center">픽</div>
            <div className="text-center">AI vs 시장</div>
            <div className="text-right">차이</div>
            <div className="text-right" title="켈리 비중 — 참고용">켈리</div>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {rows.map((b) => {
              const kelly = kellyFraction(b.eloPct, b.odds);
              return (
                <li key={b.matchId}>
                  <Link
                    href={b.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="block px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                  >
                    <div className="md:hidden space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>{b.leagueLabel}</span>
                        <span>{b.timeLabel}</span>
                      </div>
                      <div className="text-sm font-medium truncate">
                        {b.homeName} <span className="text-neutral-400">vs</span> {b.awayName}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-600 dark:text-rose-400 font-bold">
                          {b.pickLabel} @ {b.odds.toFixed(2)}
                        </span>
                        <span className="tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400 font-black">+{b.valuePct.toFixed(1)}%p</span>
                          <span className="ml-2 text-neutral-400">켈리 {(kelly * 100).toFixed(1)}%</span>
                        </span>
                      </div>
                    </div>
                    <div className="hidden md:grid grid-cols-[100px_90px_minmax(0,1fr)_70px_120px_80px_70px] gap-3 items-center text-sm">
                      <div className="text-[11px] text-neutral-600 dark:text-neutral-400 truncate">{b.leagueLabel}</div>
                      <div className="text-[11px] text-neutral-500 tabular-nums">{b.timeLabel}</div>
                      <div className="truncate">
                        <span className="font-medium">{b.homeName}</span>
                        <span className="text-neutral-400 mx-1.5">vs</span>
                        <span className="font-medium">{b.awayName}</span>
                        {b.status === "LIVE" && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            LIVE {b.homeScore ?? "-"}:{b.awayScore ?? "-"}
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-rose-600 dark:text-rose-400 font-bold text-[13px]">{b.pickLabel}</div>
                        <div className="text-[10px] text-neutral-500 tabular-nums">@ {b.odds.toFixed(2)}</div>
                      </div>
                      <div className="text-center text-[11px] tabular-nums text-neutral-600 dark:text-neutral-400">
                        <span className="font-bold">{(b.eloPct * 100).toFixed(1)}%</span>
                        <span className="text-neutral-400 mx-1">vs</span>
                        <span>{(b.impliedPct * 100).toFixed(1)}%</span>
                      </div>
                      <div className="text-right text-emerald-600 dark:text-emerald-400 font-black tabular-nums text-base">
                        +{b.valuePct.toFixed(1)}%p
                      </div>
                      <div className="text-right text-[11px] tabular-nums text-neutral-500">{(kelly * 100).toFixed(1)}%</div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-neutral-400 break-keep">
        시장 확률은 마진 제거(3-way 정규화) 값. 켈리 비중은 AI 확률이 맞다는 가정의 이론치로, 참고용이며 실제 수익을 보장하지 않습니다.
      </p>
    </div>
  );
}
