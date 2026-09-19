// 도메인(host)별 푸터 분기를 클라이언트로 — SiteChromeHeader 와 동일 사유(layout ISR 가능하게).
"use client";
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { useClientValue } from "@/lib/use-client-value";

const SCOREBOARD_HOSTS = ["스코어보드.kr", "xn--hy1bm7m1yevrd8pq"];
const LANDING_HOSTS = ["스코어베이스.com", "xn--9k3b13iba842abwcsvs"];
// sportspredictions.live — 자매 사이트는 src/app/sp/layout.tsx 가 자체 헤더·푸터를 그린다 → 루트 크롬 없음.
const SP_HOSTS = ["sportspredictions.live", ...(process.env.NODE_ENV === "production" ? [] : ["sp.localhost"])];

export type ChromeMode = "main" | "scoreboard" | "landing" | "sp";

/** 접속 host 로 어떤 사이트 껍데기를 쓸지 판정. 페이지 로드 동안 변하지 않는다. */
export function readChromeMode(): ChromeMode {
  const h = window.location.hostname.toLowerCase();
  if (SCOREBOARD_HOSTS.some((d) => h.includes(d))) return "scoreboard";
  if (LANDING_HOSTS.some((d) => h.includes(d))) return "landing";
  if (SP_HOSTS.some((d) => h.includes(d))) return "sp";
  return "main";
}

export default function SiteChromeFooter({
  main,
  scoreboard,
  en,
}: {
  main: React.ReactNode;
  scoreboard: React.ReactNode;
  en?: React.ReactNode;
}) {
  const pathname = usePathname();
  // sportspredictions.live 는 middleware rewrite(/ → /sp) 라 usePathname 은 브라우저 URL("/")을 준다.
  // 렌더 트리 기준 첫 세그먼트는 SSR 에서도 "sp" 로 잡혀 한국어 크롬이 HTML 에 실리지 않는다.
  const isSpTree = useSelectedLayoutSegment() === "sp";
  // SSR 은 host 를 모르므로 "main" 으로 그리고, 마운트 후 실제 host 로 확정한다.
  const mode = useClientValue<ChromeMode>(readChromeMode, "main");
  if (pathname?.startsWith("/embed")) return null;
  if (mode === "landing" || isSpTree || mode === "sp") return null;
  // 영어판(/en) — host 분기보다 우선 (영어 UI 는 경로 기반)
  if (en && (pathname === "/en" || pathname?.startsWith("/en/"))) return <>{en}</>;
  return <>{mode === "scoreboard" ? scoreboard : main}</>;
}
