"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  getOrCreateSessionId,
  getOrCreateTabId,
} from "@/lib/client-session-id";

const VISIBLE_INTERVAL_MS = 30_000;
const HIDDEN_INTERVAL_MS = 60_000;

function currentPath(): string {
  // Presence only needs the route. Do not retain search terms or auth-like query values.
  return window.location.pathname.slice(0, 240);
}

function currentSection(path: string): "scores" | "live" | "other" {
  if (path.startsWith("/live/")) return "live";
  const host = window.location.hostname.toLowerCase();
  const scoreboardRoot =
    path === "/" &&
    (host.includes("스코어보드") || host.includes("xn--hy1bm7m1yevrd8pq"));
  if (scoreboardRoot || path.startsWith("/scores")) return "scores";
  return "other";
}

export default function PresenceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/api")) {
      return;
    }

    const sessionId = getOrCreateSessionId();
    const tabId = getOrCreateTabId();
    if (!sessionId || !tabId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const send = () => {
      if (stopped) return;
      const path = currentPath();
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          tabId,
          path,
          visibility: document.hidden ? "hidden" : "visible",
          section: currentSection(path),
        }),
        keepalive: true,
      }).catch(() => {});
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        send();
        schedule();
      }, document.hidden ? HIDDEN_INTERVAL_MS : VISIBLE_INTERVAL_MS);
    };

    const onVisibility = () => {
      send();
      schedule();
    };
    const onPageHide = () => send();

    send();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname]);

  return null;
}
