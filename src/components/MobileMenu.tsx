"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import SearchInput from "./SearchInput";
import { ALL_CATEGORIES } from "./nav-config";

// 메뉴 구조는 nav-config.ts 단일 정의 (데스크탑 Header 와 공유) — 종목 4 + 커뮤니티.
const GROUPS = ALL_CATEGORIES;

export default function MobileMenu({ account }: { account?: ReactNode }) {
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
        className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
      >
        {open ? <CloseIcon /> : <BurgerIcon />}
      </button>

      {/* 모바일 패널 — h-[calc(100dvh-4rem)] 로 iOS Safari 동적 viewport 대응 */}
      <div
        className={`lg:hidden fixed inset-x-0 top-16 z-50 h-[calc(100dvh-4rem)] bg-white dark:bg-neutral-950 transition-all duration-200 ${
          open
            ? "opacity-100 visible"
            : "opacity-0 invisible pointer-events-none"
        }`}
      >
        <nav className="h-full overflow-y-auto px-4 pt-3 pb-8">
          {/* 로그인/계정 — 헤더에서 옮겨옴 (헤더 가로 넘침 방지). 비로그인=로그인 링크. */}
          {account && (
            <div className="mb-3 flex flex-wrap items-center gap-2">{account}</div>
          )}
          {/* 검색창 */}
          <div className="mb-4">
            <SearchInput
              variant="full"
              onSubmit={() => setOpen(false)}
            />
          </div>

          {/* 라이브 진입점 — 최상단 */}
          <Link
            href="/scores"
            className="flex items-center justify-center gap-2 w-full mb-3 px-4 py-3 rounded-xl border-2 border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/15 transition"
          >
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            라이브 스코어
          </Link>

          {/* 예측 대시보드 — 플래그십 CTA */}
          <Link
            href="/predictions"
            className="block w-full mb-4 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold text-center shadow-sm"
          >
            시즌 예측 대시보드
          </Link>

          {/* 카테고리별 */}
          <div className="space-y-5">
            {GROUPS.map((g) => (
              <div key={g.label}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
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
