"use client";
// 드림팀 섹션 공용 탭 네비 — 빌더·봇 대전·유저 대전·리더보드 (애플 세그먼트 스타일)
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dream-team", label: "빌더" },
  { href: "/dream-team/free", label: "자유 구성" },
  { href: "/dream-team/play", label: "봇 대전" },
  { href: "/dream-team/versus", label: "유저 대전" },
  { href: "/dream-team/leaderboard", label: "리더보드" },
];

export default function DreamTeamNav() {
  const path = usePathname();
  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04] sm:inline-flex">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <a
            key={t.href}
            href={t.href}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </a>
        );
      })}
    </div>
  );
}
