"use client";
// 원클릭 앱 설치 버튼 — beforeinstallprompt 지원 브라우저(안드로이드 크롬·PC 크롬/엣지)에서만 노출.
// iOS 사파리는 이벤트 미지원 → 페이지의 수동 안내(공유 → 홈 화면에 추가)가 대신한다.

import { useEffect, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** 이미 앱(standalone)으로 열려 있는지 — 서버는 알 수 없어 마운트 후에만 읽는다. */
function readStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

export default function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useClientValue(readStandalone, false);
  // appinstalled 이벤트로 설치가 확인된 경우 (이벤트 핸들러라 effect setState 아님)
  const [justInstalled, setJustInstalled] = useState(false);
  const installed = standalone || justInstalled;

  useEffect(() => {
    if (standalone) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setJustInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [standalone]);

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
