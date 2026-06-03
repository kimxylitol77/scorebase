// LIVE 매치가 있으면 15초마다 router.refresh() — SSR 매치 데이터 갱신.
// document.hidden 일 때 정지, 사용자가 토글로 ON/OFF.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** SSR 단에서 계산한 라이브 경기 수 */
  liveCount: number;
}

const POLL_MS = 15_000;

export default function LiveRefresher({ liveCount }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || liveCount === 0) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const tick = () => {
      if (document.hidden) return;
      router.refresh();
    };
    tickRef.current = setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, liveCount, router]);

  if (liveCount === 0) return null;

  return (
    <label className="inline-flex items-center gap-2 text-[11px] cursor-pointer select-none text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
        className="w-3.5 h-3.5 accent-[#00d4ff] cursor-pointer"
      />
      <span>라이브 자동 갱신</span>
    </label>
  );
}
