// 선수 가치·연봉 탭 (영어판) — /en/salaries/* 공유 네비. scripts/en-mirror 로 자동 생성.
import Link from "next/link";

const TABS = [
  { href: "/en/transfers", label: "Transfers" },
  { href: "/en/salaries/soccer", label: "Football Wages" },
  { href: "/en/salaries/kbo", label: "KBO" },
  { href: "/en/salaries/mlb", label: "MLB" },
  { href: "/en/salaries/nba", label: "NBA" },
  { href: "/en/salaries/nhl", label: "NHL" },
  { href: "/en/salaries/golf", label: "Golf" },
  { href: "/en/salaries/tennis", label: "Tennis" },
  { href: "/en/salaries/f1", label: "F1" },
] as const;

export default function PlayerValueTabs({ active, className = "" }: { active: string; className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center gap-2 ${className}`} aria-label="Player value and wages by sport">
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
