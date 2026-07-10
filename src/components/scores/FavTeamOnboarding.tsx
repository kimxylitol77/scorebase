"use client";
// 관심팀 미등록자 유도 배너 — 팀 즐겨찾기 시 재방문에 상단 고정됨을 안내. 등록/닫음 시 미노출.

import { Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFavoriteTeams } from "./useFavoriteTeams";

const DISMISS_KEY = "scorebase:onboard-favteam-dismissed";

export default function FavTeamOnboarding() {
  const { teams, mounted } = useFavoriteTeams();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // 미마운트(hydration) · 닫음 · 이미 등록(MyTeamsStrip 이 대신 노출) 이면 미표시
  if (!mounted || dismissed || teams.length > 0) return null;

  const close = () => {
    setDismissed(true);
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
        <span className="font-semibold">좋아하는 팀을 즐겨찾기</span>하면 다음 방문에 맨 위에 바로 떠요. 경기 카드나 팀 페이지의{" "}
        <Star className="inline h-3 w-3 align-[-1px] text-amber-500" aria-hidden /> 를 눌러보세요.
      </p>
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
