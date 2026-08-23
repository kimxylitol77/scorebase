// scores__PushAlertToggle (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";

import { useEffect, useState } from "react";
import { useClientValue, useCachedSnapshot } from "@/lib/use-client-value";
import {
  disablePushAlerts,
  enablePushAlerts,
  isPushEnabled,
  isPushSupported,
  schedulePushSync,
  PUSH_KINDS,
  PUSH_KIND_LABEL,
  readPushKinds,
  writePushKinds,
  type PushKind,
} from "./push-alerts";

const FAV_EVENT = "scorebase:fav-changed";
const ALL_KINDS: PushKind[] = [...PUSH_KINDS];

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
  // 종류별 옵트인 — localStorage 원본, 바꾸면 서버 재동기화
  // 배열 스냅샷은 참조가 매번 바뀌면 useSyncExternalStore 가 무한 루프 — 캐시 래퍼 필수
  const readKindsCached = useCachedSnapshot(() => readPushKinds(), (v) => v.join(","));
  const initialKinds = useClientValue(readKindsCached, ALL_KINDS);
  const [kindsOverride, setKindsOverride] = useState<PushKind[] | null>(null);
  const kinds = kindsOverride ?? initialKinds;
  const toggleKind = (k: PushKind) => {
    const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k];
    if (next.length === 0) return; // 전부 끄려면 벨을 끈다
    setKindsOverride(next);
    writePushKinds(next);
  };

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
          alert("Browser notifications are blocked. Allow them from the lock icon in the address bar.");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={enabled}
      title={enabled ? "Turn match alerts off" : "Get alerts for starred matches (kick-off, line-ups, full-time)"}
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
      {enabled ? "Match alerts on" : "Match alerts"}
    </button>
    {enabled && (
      <details className="relative">
        <summary
          className="list-none cursor-pointer rounded-md bg-neutral-100 px-1.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 [&::-webkit-details-marker]:hidden"
          aria-label="Alert types"
          title="Alert types"
        >
          Types {kinds.length}/{PUSH_KINDS.length}
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-2 text-[12px] shadow-lg dark:border-white/10 dark:bg-neutral-900">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Starred match alerts</div>
          {PUSH_KINDS.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-neutral-50 dark:hover:bg-white/[0.05]">
              <input type="checkbox" checked={kinds.includes(k)} onChange={() => toggleKind(k)} className="accent-amber-500" />
              <span>{PUSH_KIND_LABEL[k]}</span>
            </label>
          ))}
          <p className="mt-1 text-[10px] leading-snug text-neutral-400 break-keep">
            Goal and odds-movement alerts can be enabled via Telegram on your account page.
          </p>
        </div>
      </details>
    )}
    </span>
  );
}
