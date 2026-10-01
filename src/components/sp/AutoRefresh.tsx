// 라이브 경기가 있을 때만 60초마다 서버 데이터를 다시 받는다(ISR 60s 캐시를 치므로 비용 없음). 탭이 숨겨지면 멈춘다.
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ enabled, intervalMs = 60_000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
