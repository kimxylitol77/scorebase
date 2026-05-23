// /scores 페이지 상단의 "지금 진행 중" 라이브 매치 카드들.
// /api/live/scores (server 캐시 30초) + 클라이언트 60초 polling.
// LiveScoresBar (헤더 sticky chip) 와 데이터 동일, 표시만 큰 카드.
// sport prop 으로 종목 필터링.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { leaguesForSport, type SportCode } from "@/lib/sports/sport-leagues";
import LeagueBadge from "./LeagueBadge";
import CountUp from "./CountUp";
import LiveEventsPanel from "./LiveEventsPanel";

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

// 라이브 매치 있을 때 15초 · 없을 때 3분 · 탭 hidden 정지.
const POLL_LIVE_MS = 15_000;
const POLL_IDLE_MS = 180_000;

export default function ScoresLiveCards({ sport }: { sport: SportCode }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 어느 카드를 펼쳤는지 (events panel) — 한 번에 한 카드만 expand
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const countRef = useRef(0);
  countRef.current = matches.length;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;
    const demo =
      new URLSearchParams(window.location.search).get("demo") === "1";
    const url = demo ? "/api/live/scores?demo=1" : "/api/live/scores";

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag
          ? { "if-none-match": lastEtag }
          : {};
        const res = await fetch(url, { cache: "no-store", headers });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { matches?: LiveMatch[] } = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
        setLoaded(true);
      } catch {
        // 실패 시 무시
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait = countRef.current > 0 ? POLL_LIVE_MS : POLL_IDLE_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };

    fetchOnce().then(schedule);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    const onFocus = () => fetchOnce();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!loaded) return null;
  const allowed = new Set(leaguesForSport(sport));
  const filtered = matches.filter((m) => allowed.has(m.league));
  if (filtered.length === 0) return null;
  // af-prefix = API-Football fixture id (축구). events 확장 가능 종목.
  const canExpand = (m: { id: string }) => m.id.startsWith("af-");

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
      {/* 모바일: 가로 swipe carousel (scroll-snap) / 데스크탑: 그리드 2~3열 */}
      <div
        className="flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-2 overflow-x-auto sm:overflow-visible snap-x snap-mandatory -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-label="라이브 매치 캐러셀"
      >
        {filtered.map((m) => {
          const expanded = expandedId === m.id;
          return (
            <div
              key={m.id}
              className="group shrink-0 w-[80%] sm:w-auto snap-start rounded-xl bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 hover:border-rose-300 dark:hover:border-rose-500/40 transition overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <Link
                  href={`/leagues/${m.league}`}
                  className="flex items-center gap-2 flex-1 min-w-0"
                  title={`${m.awayName} ${m.awayScore} - ${m.homeScore} ${m.homeName}`}
                >
                  <span className="shrink-0">
                    <LeagueBadge league={m.league} size="sm" />
                  </span>
                  <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                    <div className="text-right truncate font-medium text-sm">
                      {m.awayShort}
                    </div>
                    <div className="text-center font-black tabular-nums text-base text-rose-600 dark:text-rose-400 min-w-[3rem]">
                      <CountUp value={m.awayScore} /> -{" "}
                      <CountUp value={m.homeScore} />
                    </div>
                    <div className="truncate font-medium text-sm">
                      {m.homeShort}
                    </div>
                  </div>
                </Link>
                <span className="shrink-0 text-[10px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {m.statusLabel}
                </span>
                {canExpand(m) && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : m.id)}
                    aria-expanded={expanded}
                    aria-label={expanded ? "이벤트 접기" : "이벤트 펼치기"}
                    className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-md text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${expanded ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
              </div>
              {expanded && canExpand(m) && (
                <div className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/40">
                  <LiveEventsPanel matchId={m.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
