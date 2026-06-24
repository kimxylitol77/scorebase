// 도메인(host)별 푸터 분기를 클라이언트로 — SiteChromeHeader 와 동일 사유(layout ISR 가능하게).
"use client";
import { useEffect, useState } from "react";

const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq"];
const LANDING_HOSTS = ["스코어베이스.com", "xn--9k3b13iba842abwcsvs"];

export default function SiteChromeFooter({
  main,
  scoreboard,
}: {
  main: React.ReactNode;
  scoreboard: React.ReactNode;
}) {
  const [mode, setMode] = useState<"main" | "scoreboard" | "landing">("main");
  useEffect(() => {
    const h = window.location.hostname.toLowerCase();
    setMode(
      SCOREBOARD_HOSTS.some((d) => h.includes(d))
        ? "scoreboard"
        : LANDING_HOSTS.some((d) => h.includes(d))
          ? "landing"
          : "main",
    );
  }, []);
  if (mode === "landing") return null;
  return <>{mode === "scoreboard" ? scoreboard : main}</>;
}
