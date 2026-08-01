// 킥오프 푸시 알림 벨 토글 — FavoriteMatches 헤더용. 비회원 OK(브라우저 구독).
// 미지원 브라우저(iOS Safari 비 PWA 등)에선 렌더하지 않는다 — 눌러도 안 되는 버튼 방지.
"use client";

import { useEffect, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";
import {
  disablePushAlerts,
  enablePushAlerts,
  isPushEnabled,
  isPushSupported,
  schedulePushSync,
} from "./push-alerts";

const FAV_EVENT = "scorebase:fav-changed";

export default function PushAlertToggle() {
  // 지원 여부·초기 ON 상태 — 하이드레이션 안전 (SSR 은 false → 마운트 후 실값)
  const supported = useClientValue(
    () => isPushSupported() && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    false,
  );
  const initialEnabled = useClientValue(() => isPushEnabled(), false);
  const [override, setOverride] = useState<boolean | null>(null); // 토글 후 상태
  const [busy, setBusy] = useState(false);
  const enabled = override ?? initialEnabled;

  // 별표 변경 → 벨 켜져 있으면 서버 재동기화 (schedulePushSync 가 내부에서 enabled 재확인)
  useEffect(() => {
    if (!supported) return;
    const onFav = () => schedulePushSync();
    window.addEventListener(FAV_EVENT, onFav);
    return () => window.removeEventListener(FAV_EVENT, onFav);
  }, [supported]);

  if (!supported) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await disablePushAlerts();
        setOverride(false);
      } else {
        const ok = await enablePushAlerts();
        setOverride(ok);
        if (!ok && Notification.permission === "denied") {
          alert("브라우저 알림이 차단돼 있습니다. 주소창 자물쇠 아이콘에서 알림을 허용해 주세요.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={enabled ? "킥오프 알림 끄기" : "별표한 경기 킥오프 알림 받기"}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
        enabled
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
          : "bg-neutral-100 text-neutral-500 hover:text-amber-500 dark:bg-neutral-800 dark:text-neutral-400"
      } ${busy ? "opacity-60" : ""}`}
    >
      {/* 벨 아이콘 */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
      </svg>
      {enabled ? "킥오프 알림 ON" : "킥오프 알림"}
    </button>
  );
}
