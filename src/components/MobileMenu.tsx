"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import SearchInput from "./SearchInput";

interface SubItem {
  href: string;
  label: string;
  desc?: string;
  icon?: string;
}

interface Group {
  label: string;
  emoji: string;
  items: SubItem[];
}

const GROUPS: Group[] = [
  {
    label: "월드컵",
    emoji: "🏆",
    items: [
      {
        href: "/leagues/WORLD_CUP",
        label: "FIFA 월드컵 2026",
        desc: "북중미 6/11~",
        icon: "⭐",
      },
    ],
  },
  {
    label: "축구",
    emoji: "⚽",
    items: [
      { href: "/leagues/EPL", label: "프리미어리그", desc: "잉글랜드", icon: "⭐" },
      { href: "/leagues/LALIGA", label: "라리가", desc: "스페인" },
      { href: "/leagues/BUNDESLIGA", label: "분데스리가", desc: "독일" },
      { href: "/leagues/SERIE_A", label: "세리에 A", desc: "이탈리아" },
      { href: "/leagues/LIGUE_1", label: "리그 1", desc: "프랑스" },
      { href: "/leagues/MLS", label: "MLS", desc: "북미" },
      { href: "/leagues/UCL", label: "챔피언스리그", desc: "유럽" },
    ],
  },
  {
    label: "농구",
    emoji: "🏀",
    items: [{ href: "/leagues/NBA", label: "NBA", desc: "미국" }],
  },
  {
    label: "야구",
    emoji: "⚾",
    items: [
      { href: "/leagues/KBO", label: "KBO 리그", desc: "한국 프로야구", icon: "⭐" },
      { href: "/leagues/MLB", label: "MLB", desc: "메이저리그" },
    ],
  },
  {
    label: "하키",
    emoji: "🏒",
    items: [{ href: "/leagues/NHL", label: "NHL", desc: "북미" }],
  },
  {
    label: "e스포츠",
    emoji: "🎮",
    items: [
      { href: "/leagues/LOL", label: "LCK", desc: "리그 오브 레전드 한국", icon: "⭐" },
    ],
  },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // 페이지 이동 시 자동 닫기
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // 열릴 때 body scroll 잠금
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        className="sm:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
      >
        {open ? <CloseIcon /> : <BurgerIcon />}
      </button>

      {/* 모바일 패널 — h-[calc(100dvh-4rem)] 로 iOS Safari 동적 viewport 대응 */}
      <div
        className={`sm:hidden fixed inset-x-0 top-16 z-50 h-[calc(100dvh-4rem)] bg-white dark:bg-neutral-950 transition-all duration-200 ${
          open
            ? "opacity-100 visible"
            : "opacity-0 invisible pointer-events-none"
        }`}
      >
        <nav className="h-full overflow-y-auto px-4 pt-3 pb-8">
          {/* 검색창 */}
          <div className="mb-4">
            <SearchInput
              variant="full"
              onSubmit={() => setOpen(false)}
            />
          </div>

          {/* 예측 진입점 강조 */}
          <Link
            href="/predictions"
            className="block w-full mb-3 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold text-center shadow-sm"
          >
            📊 시즌 예측 대시보드
          </Link>
          <Link
            href="/previews"
            className="block w-full mb-3 px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 font-semibold text-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
          >
            프리뷰 모음 (종목별)
          </Link>
          <Link
            href="/notices"
            className="block w-full mb-4 px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 font-semibold text-center text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
          >
            📢 공지사항 · 패치노트
          </Link>

          {/* 카테고리별 */}
          <div className="space-y-5">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-base">{g.emoji}</span>
                  <span className="text-xs font-bold uppercase tracking-[0.15em] text-neutral-500">
                    {g.label}
                  </span>
                </div>
                <ul className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800 overflow-hidden">
                  {g.items.map((it) => {
                    const active = path === it.href;
                    return (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          className={`flex items-center gap-2 px-4 py-3 text-sm transition ${
                            active
                              ? "bg-neutral-100 dark:bg-neutral-900 font-semibold"
                              : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                          }`}
                        >
                          {it.icon && (
                            <span className="text-amber-500 text-xs w-4">
                              {it.icon}
                            </span>
                          )}
                          <span className="flex-1">{it.label}</span>
                          {it.desc && (
                            <span className="text-[11px] text-neutral-500">
                              {it.desc}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* 테마 토글 */}
          <div className="mt-6">
            <ThemeToggle variant="full" />
          </div>

          <div className="mt-6 text-center text-[11px] text-neutral-400">
            매일 자동 업데이트되는 글로벌 스포츠 미디어
          </div>
        </nav>
      </div>
    </>
  );
}

function BurgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
