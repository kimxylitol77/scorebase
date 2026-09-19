"use client";
// /embed/* (외부 iframe 위젯) 에서는 감싼 자식을 렌더하지 않는다 — 챗봇·PiP 같은 플로팅 UI 가
// 남의 블로그 안 위젯에 떠 있으면 안 된다. SiteChromeHeader/Footer 와 같은 usePathname 방식.
import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { useClientValue } from "@/lib/use-client-value";
import { readChromeMode, type ChromeMode } from "./SiteChromeFooter";

export default function EmbedHidden({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // sportspredictions.live 는 middleware rewrite(/ → /sp) 라 usePathname 은 브라우저 URL("/")을 준다.
  // 렌더 트리 기준 첫 세그먼트는 SSR 에서도 "sp" 로 잡혀 한국어 크롬이 HTML 에 실리지 않는다.
  const isSpTree = useSelectedLayoutSegment() === "sp";
  // sportspredictions.live(영어 자매 사이트) 도 한국어 챗봇·PiP 를 띄우지 않는다.
  const mode = useClientValue<ChromeMode>(readChromeMode, "main");
  if (pathname?.startsWith("/embed") || isSpTree || mode === "sp") return null;
  return <>{children}</>;
}
