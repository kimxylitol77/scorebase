// FavoriteTeamButton (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// 팀 페이지 즐겨찾기 토글 — localStorage(useFavoriteTeams), 로그인 불요.

import { Star } from "lucide-react";
import { useFavoriteTeams } from "../scores/useFavoriteTeams";

export default function FavoriteTeamButton({
  id,
  name,
  league,
}: {
  id: number;
  name: string;
  league: string;
}) {
  const { isFav, toggle, mounted } = useFavoriteTeams();
  const fav = mounted && isFav(id);
  return (
    <button
      type="button"
      onClick={() => toggle({ id, name, league })}
      aria-pressed={fav}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
        fav
          ? "bg-amber-400/15 text-amber-600 ring-amber-400/40 dark:text-amber-400"
          : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/[0.1]"
      }`}
    >
      <Star className="h-3.5 w-3.5" fill={fav ? "currentColor" : "none"} aria-hidden />
      {fav ? "My team" : "Favourite"}
    </button>
  );
}
