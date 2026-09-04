"use client";
// /embed/* (외부 iframe 위젯) 에서는 감싼 자식을 렌더하지 않는다 — 챗봇·PiP 같은 플로팅 UI 가
// 남의 블로그 안 위젯에 떠 있으면 안 된다. SiteChromeHeader/Footer 와 같은 usePathname 방식.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function EmbedHidden({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/embed")) return null;
  return <>{children}</>;
}
