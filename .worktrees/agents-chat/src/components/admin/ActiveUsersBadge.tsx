// admin 헤더 우측에 표시되는 "현재 접속자" 배지.
// 30초 polling, document.hidden 시 정지. tooltip 에 5분/1분 분리.

"use client";

import { useEffect, useState } from "react";

interface Stat {
  active5m: number;
  active1m: number;
  pv5m: number;
  pv1m: number;
  fetchedAt: string;
}

const POLL_MS = 30_000;

export default function ActiveUsersBadge() {
  const [stat, setStat] = useState<Stat | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch("/api/admin/active", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Stat;
        if (alive) setStat(json);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, POLL_MS);
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
  }, []);

  // 로딩 중 (stat null) — placeholder
  if (!stat) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-medium animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
        <span>접속 중…</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium cursor-help"
      title={`최근 5분: ${stat.active5m}명 · ${stat.pv5m} PV
최근 1분: ${stat.active1m}명 · ${stat.pv1m} PV`}
    >
      <span className="relative inline-flex w-1.5 h-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      <span className="font-bold tabular-nums">{stat.active5m}</span>
      <span className="opacity-70">접속 중</span>
      <span className="opacity-50 text-[10px] tabular-nums ml-0.5">
        (1m: {stat.active1m})
      </span>
    </span>
  );
}
