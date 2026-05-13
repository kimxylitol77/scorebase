// /scores 페이지 상단의 "지금 진행 중" 라이브 매치 카드들.
// /api/live/scores (server 캐시 30초) + 클라이언트 60초 polling.
// LiveScoresBar (헤더 sticky chip) 와 데이터 동일, 표시만 큰 카드.
// sport prop 으로 종목 필터링.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { leaguesForSport, type SportCode } from "@/lib/sports/sport-leagues";

interface LiveMatch {
  id: string;
  league: string;
  leagueLabel: string;
  homeName: string;
  awayName: string;
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  statusLabel: string;
  startTime: string;
}

const POLL_MS = 30_000;

export default function ScoresLiveCards({ sport }: { sport: SportCode }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const demo =
      new URLSearchParams(window.location.search).get("demo") === "1";
    const url = demo ? "/api/live/scores?demo=1" : "/api/live/scores";
    const fetchOnce = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const json: { matches?: LiveMatch[] } = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
        setLoaded(true);
      } catch {
        // 실패 시 무시
      }
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    const onFocus = () => fetchOnce();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!loaded) return null;
  const allowed = new Set(leaguesForSport(sport));
  const filtered = matches.filter((m) => allowed.has(m.league));
  if (filtered.length === 0) return null;

  return (
    <section className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
          <span className="relative inline-flex w-2 h-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          진행 중 {filtered.length}경기
        </h2>
        <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70 tabular-nums">
          30초 자동 갱신
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((m) => (
          <Link
            key={m.id}
            href={`/leagues/${m.league}`}
            className="group flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-rose-300 dark:hover:border-rose-500/40 transition"
            title={`${m.awayName} ${m.awayScore} - ${m.homeScore} ${m.homeName}`}
          >
            <span className="shrink-0 text-[10px] font-bold text-neutral-500 w-12">
              {m.leagueLabel}
            </span>
            <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <div className="text-right truncate font-medium text-sm">
                {m.awayShort}
              </div>
              <div className="text-center font-black tabular-nums text-base text-rose-600 dark:text-rose-400 min-w-[3rem]">
                {m.awayScore} - {m.homeScore}
              </div>
              <div className="truncate font-medium text-sm">{m.homeShort}</div>
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
              {m.statusLabel}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
