"use client";
// 원클릭 앱 설치 버튼 — beforeinstallprompt 지원 브라우저(안드로이드 크롬·PC 크롬/엣지)에서만 노출.
// iOS 사파리는 이벤트 미지원 → 페이지의 수동 안내(공유 → 홈 화면에 추가)가 대신한다.

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // 이미 앱(standalone)으로 열려 있으면 설치 완료 상태
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="inline-flex items-center rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        이미 앱으로 사용 중입니다
      </div>
    );
  }
  if (!deferred) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") setDeferred(null);
      }}
      className="inline-flex items-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
    >
      지금 바로 설치하기
    </button>
  );
}
