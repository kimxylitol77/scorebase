// 라이브 스코어 sticky bar — 헤더 바로 아래에 표시.
// /api/live/scores 호출 + 60초 polling. 매치 0건이면 자동 숨김.
// 매치는 가로 스크롤 + 각 매치 칩 클릭 시 해당 리그 페이지로 이동.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LeagueBadge from "./LeagueBadge";

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

interface ApiResp {
  matches?: LiveMatch[];
}

const POLL_MS = 60_000;

export default function LiveScoresBar() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    // ?demo=1 검출 — useSearchParams 쓰면 layout 단에서 전체 페이지가 dynamic 강제됨.
    // mount 후 window.location 으로 직접 파싱.
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    const url = demo ? "/api/live/scores?demo=1" : "/api/live/scores";
    const fetchOnce = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const json: ApiResp = await res.json();
        if (!alive) return;
        setMatches(json.matches ?? []);
        setLoaded(true);
      } catch {
        // 실패 시 무시 — 다음 polling 에서 재시도
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

  // 첫 로딩 전 또는 매치 0건이면 렌더 자체 안 함 (CLS 방지 위해 SSR 시점에도
  // null — 라이브 매치가 있을 때만 자리 차지).
  if (!loaded || matches.length === 0) return null;

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <div
          className="flex items-stretch gap-2 overflow-x-auto py-1.5
                     [-ms-overflow-style:'none'] [scrollbar-width:'none']
                     [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label="라이브 스코어"
        >
          <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold tracking-wider uppercase text-rose-600 dark:text-rose-400">
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            LIVE
          </span>
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/leagues/${m.league}`}
              className="group shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                         bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800
                         border border-neutral-200 dark:border-neutral-800 transition"
              title={`${m.homeName} ${m.homeScore} - ${m.awayScore} ${m.awayName}`}
            >
              <LeagueBadge league={m.league} size="sm" />
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {m.awayShort}
              </span>
              <span className="font-black tabular-nums text-neutral-900 dark:text-white">
                {m.awayScore}
              </span>
              <span className="text-neutral-400">-</span>
              <span className="font-black tabular-nums text-neutral-900 dark:text-white">
                {m.homeScore}
              </span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {m.homeShort}
              </span>
              <span className="ml-1 text-[10px] text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                {m.statusLabel}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
