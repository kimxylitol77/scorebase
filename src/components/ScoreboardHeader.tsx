// 스코어보드.kr 전용 헤더 — scorebase 메인 네비(축구/야구 드롭다운·검색·프리뷰)를
// 빼고 "스코어보드" 브랜드 + 다크모드 토글만. 라이브 스코어 전용 사이트 느낌.
// layout.tsx 가 host 가 스코어보드.kr 일 때 Header 대신 이 컴포넌트를 렌더.

"use client";

import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

export default function ScoreboardHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-black text-lg tracking-tight whitespace-nowrap"
          >
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            <span>
              스코어보드<span className="text-rose-500">.kr</span>
            </span>
          </Link>
          {/* 미니 메뉴 — 프리뷰 글 목록·부상자 명단만 (사용자 요청 두 개 한정) */}
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <Link
              href="/previews"
              className="px-2 py-1 rounded-md text-[13px] font-semibold whitespace-nowrap text-neutral-600 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition"
            >
              프리뷰
            </Link>
            <Link
              href="/injuries"
              className="px-2 py-1 rounded-md text-[13px] font-semibold whitespace-nowrap text-neutral-600 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/60 transition"
            >
              부상자 명단
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline text-[11px] font-semibold text-rose-600 dark:text-rose-400 tracking-wide">
            실시간 라이브 스코어
          </span>
          <ThemeToggle variant="icon" />
        </div>
      </div>
    </header>
  );
}
