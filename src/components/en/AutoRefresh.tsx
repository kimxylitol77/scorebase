"use client";
// LIVE 매치가 있을 때만 일정 주기로 서버 컴포넌트 데이터 새로고침 (/en/scores 용)
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AutoRefresh({ enabled, intervalMs = 60000 }: { enabled: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);
  return null;
}
