"use client";

// 페이지 진입 시 /api/track 으로 PV 기록.
// /admin 영역은 자동 제외.

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    // 비동기 fire-and-forget. 에러 무시.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
