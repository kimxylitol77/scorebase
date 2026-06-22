// 선수 시장가치·연봉 페이지 종목별 탭 — /transfers · /salaries/{kbo,mlb,nba} 공유 네비
import Link from "next/link";

const TABS = [
  { href: "/transfers", label: "해외축구" },
  { href: "/salaries/kbo", label: "KBO" },
  { href: "/salaries/mlb", label: "MLB" },
  { href: "/salaries/nba", label: "NBA" },
] as const;

export default function PlayerValueTabs({ active, className = "" }: { active: string; className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="종목별 선수 가치·연봉">
      {TABS.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              on
                ? "bg-rose-600 text-white shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
                : "text-neutral-600 dark:text-neutral-300 ring-1 ring-black/10 dark:ring-white/15 hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
