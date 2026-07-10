// 축구 배당 허브 목록 — 경기 클릭 시 배당업체별 배당을 마켓 탭(1X2/오버언더/핸디캡)으로 펼침
"use client";

import { useState } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { LEAGUE_DISPLAY, LEAGUE_ORDER, getLeagueFlag } from "@/lib/sports/sport-leagues";

export type BookRec = {
  nm: string;
  h: number;
  d: number | null;
  a: number;
  tl?: number;
  ov?: number;
  un?: number;
  hl?: number;
  hh?: number;
  ha?: number;
};

export type OddsMatch = {
  id: number;
  league: string;
  status: string;
  startTime: number;
  homeKo: string;
  awayKo: string;
  homeLogo: string | null;
  awayLogo: string | null;
  hs: number | null;
  as: number | null;
  books: BookRec[];
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const z = (x: number) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function mode(arr: number[]): number {
  const c: Record<number, number> = {};
  let best = arr[0];
  let bn = 0;
  for (const v of arr) {
    c[v] = (c[v] || 0) + 1;
    if (c[v] > bn) {
      bn = c[v];
      best = v;
    }
  }
  return best;
}

const MARKETS = ["1X2", "오버언더", "핸디캡"] as const;

// 업체별 표 한 줄 — value 배열 + 각 컬럼 최고배당 강조
function OddsCells({ vals, bests }: { vals: (number | null | undefined)[]; bests: number[] }) {
  return (
    <>
      {vals.map((v, i) => (
        <div
          key={i}
          className={`text-center tabular-nums ${
            v != null && v === bests[i]
              ? "rounded bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : ""
          }`}
        >
          {v != null ? v.toFixed(2) : "-"}
        </div>
      ))}
    </>
  );
}

function MarketTable({ m, tab }: { m: OddsMatch; tab: number }) {
  const books = m.books;
  if (tab === 0) {
    const bh = Math.max(...books.map((b) => b.h));
    const bd = Math.max(...books.filter((b) => b.d != null).map((b) => b.d as number), 0);
    const ba = Math.max(...books.map((b) => b.a));
    return (
      <div>
        <div className="px-2.5 pb-1 pt-1 text-[10px] text-neutral-400">승 · 무 · 패</div>
        {books.map((b) => (
          <div
            key={b.nm}
            className="grid grid-cols-[1fr_44px_44px_44px] items-center gap-1.5 border-b border-neutral-100 px-2.5 py-1.5 text-[11px] dark:border-neutral-800"
          >
            <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
            <OddsCells vals={[b.h, b.d, b.a]} bests={[bh, bd, ba]} />
          </div>
        ))}
      </div>
    );
  }
  if (tab === 1) {
    const tb = books.filter((b) => b.tl != null);
    if (!tb.length)
      return <div className="px-2.5 py-2 text-[11px] text-neutral-400">오버언더 제공 업체 없음</div>;
    const ln = mode(tb.map((b) => b.tl as number));
    const f = tb.filter((b) => b.tl === ln);
    const bo = Math.max(...f.map((b) => b.ov as number));
    const bu = Math.max(...f.map((b) => b.un as number));
    return (
      <div>
        <div className="px-2.5 pb-1 pt-1 text-[10px] text-neutral-400">기준선 {ln} · 오버 · 언더</div>
        {f.map((b) => (
          <div
            key={b.nm}
            className="grid grid-cols-[1fr_44px_44px] items-center gap-1.5 border-b border-neutral-100 px-2.5 py-1.5 text-[11px] dark:border-neutral-800"
          >
            <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
            <OddsCells vals={[b.ov, b.un]} bests={[bo, bu]} />
          </div>
        ))}
      </div>
    );
  }
  const sb = books.filter((b) => b.hl != null);
  if (!sb.length)
    return (
      <div className="px-2.5 py-2 text-[11px] text-neutral-400">이 라인의 핸디캡 제공 업체가 적음</div>
    );
  const ln = mode(sb.map((b) => b.hl as number));
  const f = sb.filter((b) => b.hl === ln);
  const bhh = Math.max(...f.map((b) => b.hh as number));
  const bha = Math.max(...f.map((b) => b.ha as number));
  const lns = `${ln > 0 ? "+" : ""}${ln}`;
  return (
    <div>
      <div className="px-2.5 pb-1 pt-1 text-[10px] text-neutral-400">
        핸디캡 홈 {lns} · 홈 · 원정
      </div>
      {f.map((b) => (
        <div
          key={b.nm}
          className="grid grid-cols-[1fr_44px_44px] items-center gap-1.5 border-b border-neutral-100 px-2.5 py-1.5 text-[11px] dark:border-neutral-800"
        >
          <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
          <OddsCells vals={[b.hh, b.ha]} bests={[bhh, bha]} />
        </div>
      ))}
    </div>
  );
}

export default function OddsHubList({ matches }: { matches: OddsMatch[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [tab, setTab] = useState<Record<number, number>>({});

  const groups: Record<string, OddsMatch[]> = {};
  for (const m of matches) (groups[m.league] = groups[m.league] || []).push(m);
  const order = Object.keys(groups).sort(
    (a, b) => (LEAGUE_ORDER[a] ?? 999) - (LEAGUE_ORDER[b] ?? 999),
  );

  if (!matches.length)
    return <div className="py-10 text-center text-sm text-neutral-400">표시할 배당이 없습니다.</div>;

  return (
    <div>
      {order.map((lg) => (
        <div key={lg}>
          <div className="flex items-center gap-1.5 px-1.5 pb-1.5 pt-3.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span>{getLeagueFlag(lg)}</span>
            <span>{LEAGUE_DISPLAY[lg] ?? lg}</span>
          </div>
          {groups[lg].map((m) => {
            const bh = Math.max(...m.books.map((b) => b.h));
            const bd = Math.max(...m.books.filter((b) => b.d != null).map((b) => b.d as number), 0);
            const ba = Math.max(...m.books.map((b) => b.a));
            const isOpen = !!open[m.id];
            const t = tab[m.id] ?? 0;
            return (
              <div key={m.id}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}
                  className="grid w-full grid-cols-[48px_1fr_44px_44px_44px_20px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 py-2 text-left transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="text-center text-[9px] leading-tight text-neutral-400">
                    {m.status === "FINISHED" ? "종료" : fmtTime(m.startTime)}
                  </div>
                  <div className="min-w-0 text-[13px] leading-snug">
                    <div className="flex items-center gap-1.5">
                      <TeamBadge logoUrl={m.homeLogo} size={16} />
                      <span className="truncate">{m.homeKo}</span>
                      {m.hs != null && <span className="ml-auto font-medium">{m.hs}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <TeamBadge logoUrl={m.awayLogo} size={16} />
                      <span className="truncate">{m.awayKo}</span>
                      {m.as != null && <span className="ml-auto font-medium">{m.as}</span>}
                    </div>
                  </div>
                  <div className="text-center text-xs font-medium">{bh.toFixed(2)}</div>
                  <div className="text-center text-xs font-medium">{bd > 0 ? bd.toFixed(2) : "-"}</div>
                  <div className="text-center text-xs font-medium">{ba.toFixed(2)}</div>
                  <div
                    className={`text-center text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    ⌄
                  </div>
                </button>
                {isOpen && (
                  <div className="mx-1 mb-2 mt-0.5">
                    <div className="flex gap-1.5 px-1 py-2">
                      {MARKETS.map((label, i) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setTab((tt) => ({ ...tt, [m.id]: i }))}
                          className={`rounded-md border px-3 py-1 text-[11px] ${
                            t === i
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 text-neutral-500 dark:border-neutral-700"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <MarketTable m={m} tab={t} />
                    <div className="px-2.5 pt-2">
                      <Link
                        href={`/live/${m.league.toLowerCase()}/${m.id}`}
                        className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                      >
                        경기 상세 · 배당 변동 그래프 →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
