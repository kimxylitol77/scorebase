// MLB 팀 통계 카드 — MatchInsight 의 "팀 통계" 탭 안에 들어가는 client 컴포넌트.
// /api/live/mlb 30초 polling (ESPN summary) 으로 teamStats 만 받아 양 팀 bar 비교 렌더.
// MlbBoxscoreTabs 도 같은 endpoint 를 polling 하지만 두 컴포넌트 모두 ETag 사용 → 304 가 caching.

"use client";

import { useEffect, useState } from "react";

interface MlbTeamStats {
  hits: number;
  homeRuns: number;
  errors: number;
  doublePlays: number;
  strikeouts: number;
  walks: number;
  leftOnBase: number;
  hitByPitch: number;
  caughtStealing: number;
  assists: number;
}

interface MlbLiveResponse {
  live?: {
    teamStats?: { home: MlbTeamStats; away: MlbTeamStats } | null;
  };
}

interface Props {
  gameId: string;
  homeNameKo: string;
  awayNameKo: string;
}

const POLL_MS = 30_000;

export default function MlbTeamStatsLive({ gameId, homeNameKo, awayNameKo }: Props) {
  const [teamStats, setTeamStats] = useState<{
    home: MlbTeamStats;
    away: MlbTeamStats;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let etag: string | null = null;
    const once = async () => {
      try {
        const headers: HeadersInit = etag ? { "if-none-match": etag } : {};
        const res = await fetch(`/api/live/mlb/${gameId}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const e = res.headers.get("etag");
        if (e) etag = e;
        const j: MlbLiveResponse = await res.json();
        if (!alive || !j.live) return;
        if (j.live.teamStats) setTeamStats(j.live.teamStats);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await once();
        schedule();
      }, POLL_MS);
    };
    once().then(schedule);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId]);

  if (!teamStats) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        매치 시작 후 팀 통계가 표시됩니다.
      </p>
    );
  }

  const rows: Array<{ label: string; key: keyof MlbTeamStats }> = [
    { label: "안타", key: "hits" },
    { label: "홈런", key: "homeRuns" },
    { label: "볼넷", key: "walks" },
    { label: "삼진", key: "strikeouts" },
    { label: "실책", key: "errors" },
    { label: "병살", key: "doublePlays" },
    { label: "잔루", key: "leftOnBase" },
    { label: "사구", key: "hitByPitch" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        <span className="text-blue-600 dark:text-blue-400 font-bold">
          {awayNameKo}
        </span>
        <span className="text-rose-600 dark:text-rose-400 font-bold">
          {homeNameKo}
        </span>
      </div>
      {rows.map((r) => {
        const a = teamStats.away[r.key];
        const h = teamStats.home[r.key];
        const max = Math.max(a, h, 1);
        return (
          <div key={r.key} className="flex items-center gap-2 text-xs">
            <div className="w-8 text-right tabular-nums font-bold">{a}</div>
            <div className="flex-1 flex items-center gap-1">
              <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-900 rounded-l overflow-hidden flex justify-end">
                <div
                  className="h-full bg-blue-400 dark:bg-blue-500"
                  style={{ width: `${(a / max) * 100}%` }}
                />
              </div>
              <div className="text-[10px] font-bold text-neutral-500 w-10 text-center">
                {r.label}
              </div>
              <div className="flex-1 h-2 bg-neutral-100 dark:bg-neutral-900 rounded-r overflow-hidden">
                <div
                  className="h-full bg-rose-400 dark:bg-rose-500"
                  style={{ width: `${(h / max) * 100}%` }}
                />
              </div>
            </div>
            <div className="w-8 text-left tabular-nums font-bold">{h}</div>
          </div>
        );
      })}
    </div>
  );
}
