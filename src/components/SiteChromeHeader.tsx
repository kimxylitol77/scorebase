// 도메인(host)별 사이트 헤더 분기를 클라이언트로 — root layout 이 headers() 를 안 읽게 해 전체 ISR 가능.
// 메인 도메인(트래픽 대부분)은 SSR=CSR 동일이라 깜빡임 0, 부가 도메인(noindex 별칭)만 hydration 후 전환.
"use client";
import { useEffect, useState } from "react";

const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq"];
const LANDING_HOSTS = ["스코어베이스.com", "xn--9k3b13iba842abwcsvs"];

export default function SiteChromeHeader({
  main,
  scoreboard,
}: {
  main: React.ReactNode;
  scoreboard: React.ReactNode;
}) {
  const [mode, setMode] = useState<"main" | "scoreboard" | "landing">("main");
  useEffect(() => {
    const h = window.location.hostname.toLowerCase();
    const m = SCOREBOARD_HOSTS.some((d) => h.includes(d))
      ? "scoreboard"
      : LANDING_HOSTS.some((d) => h.includes(d))
        ? "landing"
        : "main";
    setMode(m);
    // /scores 컬럼 축약 CSS(body.sb-mode, globals.css) — 스코어보드.kr 만.
    document.body.classList.toggle("sb-mode", m === "scoreboard");
  }, []);
  if (mode === "landing") return null;
  return <>{mode === "scoreboard" ? scoreboard : main}</>;
}
