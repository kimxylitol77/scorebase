"use client";

// 라이브 모멘텀 탭 — SSR 초기 trend 로 그리고, LIVE 중엔 /api/live/match 를 120초 폴링해 자동 갱신.
// 워커가 trend 를 5분 주기로 적재하므로 120초면 충분 (SportLiveDetail 5초 폴링과 별개·경량).

import { useEffect, useRef, useState } from "react";
import MatchTrendChart, { type MatchTrendData } from "@/components/live/MatchTrendChart";
import type { SoccerGoal } from "@/lib/sports/live-scores";

const POLL_MS = 120_000;

interface Props {
  gameId: string;
  league: string;
  initialTrend: MatchTrendData | null;
  initialGoals: SoccerGoal[] | null;
  homeNameKo: string;
  awayNameKo: string;
  initialHomeScore: number | null;
  initialAwayScore: number | null;
  /** DB Match.status — LIVE 일 때만 폴링 시작 */
  initialStatus: string;
}

export default function LiveMomentumTab({
  gameId,
  league,
  initialTrend,
  initialGoals,
  homeNameKo,
  awayNameKo,
  initialHomeScore,
  initialAwayScore,
  initialStatus,
}: Props) {
  const [trend, setTrend] = useState<MatchTrendData | null>(initialTrend);
  const [goals, setGoals] = useState<SoccerGoal[] | null>(initialGoals);
  const [homeScore, setHomeScore] = useState<number | null>(initialHomeScore);
  const [awayScore, setAwayScore] = useState<number | null>(initialAwayScore);
  const stoppedRef = useRef(initialStatus !== "LIVE");

  useEffect(() => {
    if (stoppedRef.current) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch(
          `/api/live/match/${gameId}?league=${encodeURIComponent(league)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json: {
          live?: {
            status?: string;
            homeScore?: number | null;
            awayScore?: number | null;
            trend?: MatchTrendData | null;
            trendGoals?: SoccerGoal[] | null;
          };
        } = await res.json();
        if (!alive || !json.live) return;
        if (json.live.trend?.data?.length) setTrend(json.live.trend);
        if (json.live.trendGoals?.length) setGoals(json.live.trendGoals);
        if (json.live.homeScore != null) setHomeScore(json.live.homeScore);
        if (json.live.awayScore != null) setAwayScore(json.live.awayScore);
        // 종료되면 폴링 중단 (마지막 응답의 최종 곡선 유지)
        if (json.live.status === "FINAL") stoppedRef.current = true;
      } catch {
        // 폴링 실패 무시 — 기존 곡선 유지
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (stoppedRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, POLL_MS);
    };
    schedule();
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
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

  if (!trend || !Array.isArray(trend.data) || trend.data.length === 0) return null;
  return (
    <div className="space-y-2">
      <MatchTrendChart
        trend={trend}
        homeNameKo={homeNameKo}
        awayNameKo={awayNameKo}
        homeScore={homeScore}
        awayScore={awayScore}
        goals={goals}
      />
      <p className="text-[11px] leading-relaxed text-neutral-500">
        어느 팀이 공격 주도권을 잡고 있는지 분 단위로 보여주는 흐름 그래프입니다. 위쪽 막대가
        홈팀, 아래쪽 막대가 원정팀의 공세이며, 라이브 중에는 자동으로 갱신됩니다.
      </p>
    </div>
  );
}
