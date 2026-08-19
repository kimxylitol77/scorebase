"use client";
// 피치 마커 이탈 감시 비콘 — 마커가 피치 컨테이너 밖으로 밀리면 실사용자 브라우저에서 신고한다.
//
// 왜. 피치 쏠림은 늘 사용자 눈으로 발견됐다(고정 px 센터서클 → world-cup/best-xi 어긋남,
// Tailwind 4 translate 유틸 → 구형 Chromium 에서 XI 우하향 쏠림 2026-08-15). 개발 환경은
// 항상 최신 브라우저라 사전 재현이 안 되는 부류다 — 깨진 그 환경에서 직접 재게 한다.
// 판정은 "마커 박스가 컨테이너를 8px 넘게 벗어났는가" 하나 — 원인(px·transform·좌표)과
// 무관하게 이 invariant 만 깨지면 잡힌다. 세션당 1회·서버 rate limit 이중 방어.
import { useEffect, useRef } from "react";

const OVERFLOW_PX = 8; // 정상 렌더는 0 (마커 폭·좌표가 여유 있게 설계됨) — 서브픽셀 반올림 여유
const SETTLE_MS = 2500; // 폰트·이미지 로드로 마커 높이가 안정된 뒤 측정

export default function PitchSentinel() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        // 봇 제외 — CSS 를 안 읽는 헤드리스 크롤러는 마커가 배치될 수 없어 측정이 무의미하다
        // (2026-08-19 HeadlessChrome 504px 오탐 실측 — 스타일시트 차단 재현으로 확정).
        if (navigator.webdriver || /HeadlessChrome|bot|spider|crawl/i.test(navigator.userAgent)) return;
        if (sessionStorage.getItem("pitch-overflow-sent")) return;
        const pitch = ref.current?.parentElement;
        if (!pitch) return;
        const pr = pitch.getBoundingClientRect();
        if (pr.width < 100) return; // 아직 레이아웃 전이면 스킵
        let max = 0;
        for (const m of pitch.querySelectorAll(":scope > [data-pitch-marker]")) {
          const r = m.getBoundingClientRect();
          max = Math.max(max, pr.left - r.left, r.right - pr.right, pr.top - r.top, r.bottom - pr.bottom);
        }
        if (max <= OVERFLOW_PX) return;
        sessionStorage.setItem("pitch-overflow-sent", "1");
        fetch("/api/track/error", {
          method: "POST",
          keepalive: true,
          body: JSON.stringify({
            kind: "layout",
            path: location.pathname + location.search,
            message: `pitch-overflow ${Math.round(max)}px · ${navigator.userAgent.slice(0, 160)}`,
          }),
        }).catch(() => {});
      } catch {
        // 측정 실패는 조용히 — 감시가 화면을 깨면 안 된다
      }
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  return <span ref={ref} hidden aria-hidden />;
}
