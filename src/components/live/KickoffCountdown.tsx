// SCHEDULED 매치 kickoff 카운트다운 — 1초 갱신 client component.
// kickoff 이미 지났으면 hide (SSR 단에서 status 가 LIVE/FINISHED 로 갱신).

"use client";

import { useEffect, useState } from "react";

interface Props {
  /** kickoff ISO string (server 가 Date → toISOString) — client hydration 안전 */
  kickoffIso: string;
}

function fmt(ms: number): string {
  if (ms <= 0) return "곧 시작";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (days > 0) return `${days}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${String(m).padStart(2, "0")}분`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function KickoffCountdown({ kickoffIso }: Props) {
  const kickoff = new Date(kickoffIso).getTime();
  const [remaining, setRemaining] = useState(kickoff - Date.now());
  useEffect(() => {
    const t = setInterval(() => setRemaining(kickoff - Date.now()), 1000);
    return () => clearInterval(t);
  }, [kickoff]);
  if (remaining <= -60 * 60 * 1000) return null; // 1시간 지났는데 status 안 바뀌면 표시 안 함
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-medium">
      <span>⏱</span>
      <span className="tabular-nums">{fmt(remaining)}</span>
    </span>
  );
}
