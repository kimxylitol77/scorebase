// 영어판(/en) 전용 사이트 헤더 — 한국어 헤더의 린 버전 (Standings·Predictions + 언어 전환).
import Link from "next/link";
import { Mark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LangSwitch from "@/components/en/LangSwitch";

const NAV = [
  { href: "/en/scores", label: "Scores", live: true },
  { href: "/en/standings", label: "Standings" },
  { href: "/en/predictions", label: "Predictions" },
];

export default function EnHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/80 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/en" className="flex items-center gap-2 shrink-0" aria-label="Scorebase home">
          <Mark size={26} />
          <span className="text-lg font-bold tracking-tight">Scorebase</span>
          <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-widest text-neutral-400 mt-0.5">
            Beta · EN
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 text-sm">
          {NAV.map((it) =>
            it.live ? (
              <Link
                key={it.href}
                href={it.href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition whitespace-nowrap"
              >
                <span className="relative inline-flex w-1.5 h-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500" />
                </span>
                {it.label}
              </Link>
            ) : (
              <Link
                key={it.href}
                href={it.href}
                className="px-3 py-1.5 rounded-full font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 transition whitespace-nowrap"
              >
                {it.label}
              </Link>
            ),
          )}
          <LangSwitch target="ko" />
          <ThemeToggle variant="icon" />
        </nav>
      </div>
    </header>
  );
}
