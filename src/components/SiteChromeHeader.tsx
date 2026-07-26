// 도메인(host)별 사이트 헤더 분기를 클라이언트로 — root layout 이 headers() 를 안 읽게 해 전체 ISR 가능.
// 메인 도메인(트래픽 대부분)은 SSR=CSR 동일이라 깜빡임 0, 부가 도메인(noindex 별칭)만 hydration 후 전환.
"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq"];
const LANDING_HOSTS = ["스코어베이스.com", "xn--9k3b13iba842abwcsvs"];

export default function SiteChromeHeader({
  main,
  scoreboard,
  en,
}: {
  main: React.ReactNode;
  scoreboard: React.ReactNode;
  en?: React.ReactNode;
}) {
  const pathname = usePathname();
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
  // 임베드(iframe) 라우트는 사이트 헤더 없이 위젯만 — 외부 블로그에 붙는 화면.
  if (pathname?.startsWith("/embed")) return null;
  if (mode === "landing") return null;
  // 영어판(/en) — host 분기보다 우선 (영어 UI 는 경로 기반)
  if (en && (pathname === "/en" || pathname?.startsWith("/en/"))) return <>{en}</>;
  return <>{mode === "scoreboard" ? scoreboard : main}</>;
}
