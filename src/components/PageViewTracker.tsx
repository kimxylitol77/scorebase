"use client";

// 페이지 진입 시 /api/track 으로 PV 기록.
// /admin 영역은 자동 제외.
// localStorage 에 sessionId 발급 — unique 방문자 카운트 위한 라벨 (개인정보 X, random).

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

// /scores 종목 탭 구분 기록용 화이트리스트 — 임의 쿼리 오염 방지.
// 종목 탭 전환은 pathname 이 같아 기존엔 PV 자체가 안 찍혔음 (2026-07-23).
const SCORES_SPORTS = new Set([
  "all", "soccer", "baseball", "basketball", "volleyball",
  "hockey", "esports", "mma", "tennis", "golf", "f1",
]);

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

// 유입(랜딩) 판정 — 탭 sessionStorage 1회 + KST 날짜 바뀌면 재랜딩 취급 (GA 세션 유사).
// 랜딩 PV 에만 document.referrer 를 보냄: SPA 내부 이동 PV 까지 같은 외부 referrer 가
// 반복 기록되면 채널별 집계가 PV 만큼 과대되므로 "유입 1회 = 1행"으로 고정.
const LANDED_KEY = "scorebase-landed";

function isLandingNow(): boolean {
  if (typeof window === "undefined") return false;
  const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const prev = sessionStorage.getItem(LANDED_KEY);
    if (prev === todayKst) return false;
    sessionStorage.setItem(LANDED_KEY, todayKst);
    return true;
  } catch {
    // private mode 등 — sessionStorage 불가 시 랜딩으로 간주 (최초 1 PV 만 호출되는 게 보통)
    return true;
  }
}

export default function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);

  // /scores 는 종목 탭(?sport=)별로 분리 기록 — admin 인기 페이지에서 종목별 소비 확인용.
  // 화이트리스트 외 값·타 페이지 쿼리는 기존대로 pathname 만 (date/league 변화는 PV 미기록).
  const sportParam = searchParams?.get("sport") ?? null;
  const sport =
    pathname === "/scores" && sportParam && SCORES_SPORTS.has(sportParam)
      ? sportParam
      : null;
  const trackPath = sport ? `/scores?sport=${sport}` : pathname;

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    if (lastPath.current === trackPath) return;
    lastPath.current = trackPath;

    const sessionId = getSessionId();
    const isLanding = isLandingNow();
    // 랜딩일 때만 유입 출처 전송 — 직접 진입(즐겨찾기·주소창)은 빈 문자열.
    const referrer = isLanding ? document.referrer || null : null;
    // utm_source — referrer 를 안 남기는 앱(카톡 등) 유입 식별. 랜딩 URL 쿼리에서 추출.
    let utmSource: string | null = null;
    if (isLanding) {
      try {
        utmSource =
          new URLSearchParams(window.location.search)
            .get("utm_source")
            ?.toLowerCase()
            .slice(0, 64) || null;
      } catch {
        // URLSearchParams 실패 — 무시
      }
    }

    // 비동기 fire-and-forget. 에러 무시.
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: trackPath, sessionId, isLanding, referrer, utmSource }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname, trackPath]);

  return null;
}
