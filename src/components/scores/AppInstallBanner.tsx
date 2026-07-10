"use client";
// PWA 홈 화면 추가 유도 배너 — beforeinstallprompt 캐치(Android/Chrome) + iOS 공유 안내. 설치완료/닫음 시 미노출.

import { X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "scorebase:onboard-pwa-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function AppInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // 무시하고 계속
    }
    // 이미 설치(standalone 실행)면 미노출
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !/MSStream/i.test(ua);
    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 미니바 억제, 커스텀 배너로 유도
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 무시
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    close();
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3.5 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/[0.06]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-neutral-800 sm:text-[13px] dark:text-neutral-100">
          스코어베이스를 홈 화면에
        </p>
        <p className="text-[11px] text-neutral-500 sm:text-xs">
          {isIOS ? "공유 → '홈 화면에 추가'로 앱처럼 사용" : "라이브 스코어를 앱처럼 바로 열기"}
        </p>
      </div>
      {!isIOS && (
        <button
          onClick={install}
          className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-600"
        >
          추가
        </button>
      )}
      <button
        onClick={close}
        aria-label="닫기"
        className="shrink-0 rounded-md p-1 text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
