import Link from "next/link";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import SearchInput from "./SearchInput";
import AdminBadge from "./AdminBadge";
import UserBadge from "./UserBadge";
import LangSwitch from "./en/LangSwitch";
import {
  SPORT_CATEGORIES,
  COMMUNITY_CATEGORY,
  type NavCategory,
} from "./nav-config";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Logo />

        {/* 데스크탑 메뉴 */}
        <nav className="hidden sm:flex items-center gap-1 lg:gap-2 text-sm">
          <Link
            href="/scores"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition whitespace-nowrap"
          >
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
            </span>
            라이브 스코어
          </Link>
          {SPORT_CATEGORIES.map((c) => (
            <CategoryDropdown key={c.label} {...c} />
          ))}
          <CategoryDropdown {...COMMUNITY_CATEGORY} />

          {/* 검색 + 다크모드 (데스크탑) */}
          <div className="hidden md:block ml-2">
            <SearchInput variant="compact" />
          </div>
          <div className="ml-1 flex items-center gap-2">
            <UserBadge />
            <AdminBadge />
            <LangSwitch target="en" />
            <ThemeToggle variant="icon" />
          </div>
        </nav>

        {/* 모바일 — 햄버거만. user/admin 배지는 메뉴 안으로 옮김.
            (로그인 시 닉네임+로그아웃이 헤더 가로폭을 넘겨 → iOS Safari 가 body 가로
             overflow 로 fixed inset-x-0 메뉴 패널·콘텐츠를 우측에서 잘라내던 버그 차단) */}
        <div className="sm:hidden">
          <MobileMenu account={<><UserBadge /><AdminBadge /></>} />
        </div>
      </div>
    </header>
  );
}

function CategoryDropdown({ label, href, items }: NavCategory) {
  return (
    <div className="relative group">
      <Link
        href={href}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition whitespace-nowrap"
      >
        {label}
        {items.length > 1 && (
          <svg
            className="w-3 h-3 opacity-50 group-hover:opacity-100 transition group-hover:rotate-180"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </Link>

      {items.length > 1 && (
        <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-150">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl shadow-neutral-900/10 dark:shadow-black/40 p-1.5 min-w-[220px]">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                    {it.label}
                  </span>
                  {it.desc && (
                    <span className="block text-[11px] text-neutral-500">
                      {it.desc}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
