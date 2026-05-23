"use client";

// 페이지 진입 시 /api/track 으로 PV 기록.
// /admin 영역은 자동 제외.
// localStorage 에 sessionId 발급 — unique 방문자 카운트 위한 라벨 (개인정보 X, random).

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const SESSION_KEY = "scorebase-sid";

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let sid = localStorage.getItem(SESSION_KEY);
    if (!sid) {
      // crypto.randomUUID 있으면 사용, 없으면 fallback
      sid =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    // private mode / quota 등 — 무시
    return null;
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const sessionId = getSessionId();

    // 비동기 fire-and-forget. 에러 무시.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, sessionId }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
