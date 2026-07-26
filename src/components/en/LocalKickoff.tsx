"use client";
// 경기 시작 시각 — SSR 은 UTC 로 렌더, 마운트 후 방문자 로컬 타임존으로 교체.
import { useEffect, useState } from "react";

export default function LocalKickoff({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const d = new Date(iso);
  const utc = new Intl.DateTimeFormat("en-US", {
    ...(withDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat("en-US", {
        ...(withDate ? { month: "short", day: "numeric" } : {}),
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      }).format(d),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return <span suppressHydrationWarning>{label ?? `${utc} UTC`}</span>;
}
