// 농구 라이브 배당 탭 — MatchInsight "라이브 배당" 탭 content (client).
// /api/live/match/[gameId] 를 자체 폴링해 liveOdds 를 LiveOddsCard 로 렌더.
// SportLiveDetail 과 별개로 폴링하지만 etag 304 캐시로 부담 적음.

"use client";

import { useEffect, useRef, useState } from "react";
import LiveOddsCard from "./LiveOddsCard";

interface LiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  fetchedAt: number;
}

interface Props {
  gameId: string;
  league: string;
  homeNameKo: string;
  awayNameKo: string;
  eloPrediction?: { home: number; draw?: number | null; away: number } | null;
  oddsHistory?: Array<{ fetchedAt: number; home: number; draw: number | null; away: number }>;
}

const POLL_LIVE_MS = 5_000;
const POLL_IDLE_MS = 60_000;

export default function BasketballLiveOddsTab({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  eloPrediction,
  oddsHistory,
}: Props) {
  const [odds, setOdds] = useState<LiveOdds | null>(null);
  const [loaded, setLoaded] = useState(false);
  const statusRef = useRef<"LIVE" | "OTHER">("OTHER");

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag ? { "if-none-match": lastEtag } : {};
        const res = await fetch(
          `/api/live/match/${gameId}?league=${encodeURIComponent(league)}`,
          { cache: "no-store", headers },
        );
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: { status?: string; liveOdds?: LiveOdds | null } } =
          await res.json();
        if (!alive) return;
        statusRef.current = json.live?.status === "LIVE" ? "LIVE" : "OTHER";
        setOdds(json.live?.liveOdds ?? null);
        setLoaded(true);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait = statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_IDLE_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };
    fetchOnce().then(schedule);
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [gameId, league]);

  if (!odds) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-4 text-xs text-neutral-500">
        {loaded
          ? "ⓘ 현재 제공되는 라이브 배당이 없습니다."
          : "라이브 배당 불러오는 중…"}
      </div>
    );
  }

  return (
    <LiveOddsCard
      odds={odds}
      homeNameKo={homeNameKo}
      awayNameKo={awayNameKo}
      hasDraw={false}
      eloPrediction={eloPrediction}
      oddsHistory={oddsHistory}
    />
  );
}
