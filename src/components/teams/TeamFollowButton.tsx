// 팀 팔로우 버튼 — 팀 페이지 헤더 / 검색 결과 등에 사용.
// 클릭 시 즐겨찾기 toggle. mounted 전엔 placeholder (SSR 안전).

"use client";

import { useFavoriteTeams } from "./useFavoriteTeams";

interface Props {
  teamId: number | string;
  size?: "sm" | "md";
}

export default function TeamFollowButton({ teamId, size = "md" }: Props) {
  const { isFav, toggle, mounted } = useFavoriteTeams();
  const id = String(teamId);
  const active = mounted && isFav(id);

  const dim = size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      aria-pressed={active}
      title={active ? "팔로우 해제" : "팀 팔로우"}
      className={`${dim} rounded-full font-bold inline-flex items-center gap-1 transition ${
        active
          ? "bg-rose-500 text-white hover:bg-rose-600"
          : "bg-neutral-100 dark:bg-white/5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/10"
      }`}
    >
      <span className="text-base leading-none">{active ? "♥" : "♡"}</span>
      <span>{active ? "팔로우 중" : "팔로우"}</span>
    </button>
  );
}
