// scores__FavTeamOnboarding (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// 관심팀 미등록자 유도 배너 — 팀 즐겨찾기 시 재방문에 상단 고정됨을 안내. 등록/닫음 시 미노출.

import { Star, X } from "lucide-react";
import { useState } from "react";
import { useFavoriteTeams } from "../../scores/useFavoriteTeams";
import { useClientValue } from "@/lib/use-client-value";

const DISMISS_KEY = "scorebase:onboard-favteam-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function FavTeamOnboarding() {
  const { teams, mounted } = useFavoriteTeams();
  // SSR 기본값은 "닫힘" — 하이드레이션 직후 배너가 번쩍이지 않는다.
  const storedDismissed = useClientValue(readDismissed, true);
  const [closedNow, setClosedNow] = useState(false);
  const dismissed = storedDismissed || closedNow;

  // 미마운트(hydration) · 닫음 · 이미 등록(MyTeamsStrip 이 대신 노출) 이면 미표시
  if (!mounted || dismissed || teams.length > 0) return null;

  const close = () => {
    setClosedNow(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode 등 — 무시
    }
  };

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-2.5 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
      <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" aria-hidden />
      <p className="flex-1 text-xs leading-relaxed text-neutral-700 sm:text-[13px] dark:text-neutral-300">
        <span className="font-semibold">Star your favourite teams</span> and they appear at the top next time. Tap the{" "}
        <Star className="inline h-3 w-3 align-[-1px] text-amber-500" aria-hidden />  on a match card or team page.
      </p>
      <button
        onClick={close}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:hover:bg-white/10 dark:hover:text-neutral-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
