"use client";
// 경기 시작 시각 — SSR 은 UTC 로 렌더, 마운트 후 방문자 로컬 타임존으로 교체.
import { useCallback } from "react";
import { useClientValue } from "@/lib/use-client-value";

export default function LocalKickoff({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const d = new Date(iso);
  const utc = new Intl.DateTimeFormat("en-US", {
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
  // 방문자 로컬 타임존은 서버가 알 수 없다. 마운트 후 값으로 교체한다.
  // 문자열이라 매 렌더 같은 값이면 참조 비교도 안전하다.
  const readLocal = useCallback(
    () =>
      new Intl.DateTimeFormat("en-US", {
        ...(withDate ? { month: "short", day: "numeric" } : {}),
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso)),
    [iso, withDate],
  );
  const label = useClientValue<string | null>(readLocal, null);
  return <span suppressHydrationWarning>{label ?? `${utc} UTC`}</span>;
}
