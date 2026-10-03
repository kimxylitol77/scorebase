"use client";
// KBL·WKBL 문자중계 탭 — 쿼터 선택 + "주요 장면만"(득점·파울·작전 타임·퇴장) + 장면별 스코어. 경기 중 15초 폴링.
import { useEffect, useMemo, useState } from "react";
import type { KblPlay } from "@/lib/sports/kbl-game";

const KEY_KINDS = new Set(["score", "foul", "stoppage"]);
const KIND_DOT: Record<string, string> = {
  score: "bg-emerald-500", miss: "bg-zinc-300 dark:bg-zinc-600", rebound: "bg-sky-400", defense: "bg-violet-400",
  foul: "bg-amber-400", sub: "bg-zinc-300 dark:bg-zinc-600", stoppage: "bg-rose-400", other: "bg-zinc-300 dark:bg-zinc-600",
};

export default function KblPlayByPlay({ gameId, homeName, awayName, league = "KBL" }: { gameId: string; homeName: string; awayName: string; league?: "KBL" | "WKBL" }) {
  const [plays, setPlays] = useState<KblPlay[]>([]);
  const [starters, setStarters] = useState<{ home: string[]; away: string[] }>({ home: [], away: [] });
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState<string | null>(null);
  const [keyOnly, setKeyOnly] = useState(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      let live = false;
      try {
        const r = await fetch(`/api/live/${league === "WKBL" ? "wkbl" : "kbl"}-pbp/${gameId}`);
        if (r.ok) {
          const j: { status: string; plays: KblPlay[]; starters: { home: string[]; away: string[] } } = await r.json();
          if (!alive) return;
          setPlays(j.plays);
          setStarters(j.starters);
          live = j.status === "LIVE";
        }
      } catch {
        // 다음 주기에 다시
      }
      if (!alive) return;
      setLoaded(true);
      if (live) timer = setTimeout(load, 15_000);
    };
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, league]);

  const periods = useMemo(() => [...new Set(plays.map((p) => p.period))], [plays]);
  const cur = period && periods.includes(period) ? period : periods[periods.length - 1] ?? null;
  const shown = plays
    .filter((p) => p.period === cur && (!keyOnly || KEY_KINDS.has(p.kind)))
    .reverse();

  if (!loaded) return <p className="py-6 text-center text-sm text-neutral-500">문자중계 불러오는 중…</p>;
  if (plays.length === 0) return <p className="py-6 text-center text-sm text-neutral-500">경기가 시작되면 문자중계가 나옵니다.</p>;

  return (
    <div className="space-y-3">
      {(starters.home.length > 0 || starters.away.length > 0) && (
        <div className="grid gap-2 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-white/[0.04] sm:grid-cols-2">
          <p className="break-keep"><span className="font-bold">{homeName} 선발</span> <span className="text-neutral-500">{starters.home.join(" · ")}</span></p>
          <p className="break-keep"><span className="font-bold">{awayName} 선발</span> <span className="text-neutral-500">{starters.away.join(" · ")}</span></p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${p === cur ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-neutral-300"}`}
            >
              {p.startsWith("OT") ? `연장${p.slice(2)}` : p}
            </button>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={keyOnly} onChange={(e) => setKeyOnly(e.target.checked)} />
          주요 장면만
        </label>
      </div>
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl ring-1 ring-black/5 dark:divide-white/[0.06] dark:ring-white/10">
        {shown.map((p) => (
          <li key={p.n} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
            <span className="w-10 shrink-0 tabular-nums text-neutral-400">{p.clock}</span>
            <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[p.kind]}`} aria-hidden />
            <span className="w-16 shrink-0 truncate text-xs text-neutral-500 sm:w-24">
              {p.side === "home" ? homeName : p.side === "away" ? awayName : ""}
            </span>
            <span className={`min-w-0 flex-1 break-keep ${p.kind === "score" ? "font-semibold" : ""}`}>
              {p.player ? `${p.player} ` : ""}{p.text}
            </span>
            <span className={`shrink-0 tabular-nums ${p.points ? "font-bold" : "text-neutral-400"}`}>
              {p.homeScore}-{p.awayScore}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-neutral-400">출처 {league} 공식 문자중계 · 스코어는 {homeName}-{awayName} 순 · 경기 중 15초마다 갱신</p>
    </div>
  );
}
