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
  // 남은 시간은 마운트 후에만 계산한다. 렌더 중 Date.now() 는 순수하지 않고(react-hooks/purity),
  // 서버가 그린 초와 클라이언트가 그리는 초가 달라 하이드레이션도 어긋난다.
  // 첫 값은 다음 프레임에 채워져 눈에 띄는 공백이 없다.
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(kickoff - Date.now());
    const raf = requestAnimationFrame(tick);
    const t = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [kickoff]);
  if (remaining === null) return null; // 마운트 전 (SSR 포함)
  if (remaining <= -60 * 60 * 1000) return null; // 1시간 지났는데 status 안 바뀌면 표시 안 함
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-medium">
      <span>⏱</span>
      <span className="tabular-nums">{fmt(remaining)}</span>
    </span>
  );
}
