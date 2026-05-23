// Hero 바로 아래 — "매일 분석하는 4가지" 진입 카드 grid.

import Link from "next/link";

interface Card {
  href: string;
  title: string;
  description: string;
  highlight?: boolean;
}

const CARDS: Card[] = [
  {
    href: "/predictions",
    title: "시즌 예측 대시보드",
    description: "Elo · Monte Carlo 시뮬레이션으로 본 리그 우승·강등 확률",
  },
  {
    href: "/scores",
    title: "스코어베이스 라이브스코어",
    description: "KBO · NPB · MLB · EPL · NBA · NHL 라이브 푸시 (평균 2-3초)",
    highlight: true,
  },
  {
    href: "/previews",
    title: "프리뷰 모음",
    description: "매 경기 AI 가 자동 생성하는 매치 인사이트",
  },
  {
    href: "/injuries",
    title: "부상자 명단",
    description: "10개 리그 부상자 매일 갱신",
  },
];

export default function HomeFocusCards() {
  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 sm:mt-8 mb-8 sm:mb-12"
      aria-label="주요 페이지 바로 이동"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className={`group relative block rounded-xl border p-5 sm:p-6 transition-all hover:-translate-y-0.5 ${
              c.highlight
                ? "border-rose-500/30 bg-gradient-to-br from-rose-500/5 to-transparent hover:border-rose-500/60 hover:shadow-lg hover:shadow-rose-500/10"
                : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {c.highlight && (
                    <span className="relative inline-flex w-2 h-2 flex-none">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                    </span>
                  )}
                  <h3 className="text-base sm:text-lg font-bold tracking-tight">
                    {c.title}
                  </h3>
                </div>
                <p className="mt-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {c.description}
                </p>
              </div>
              <span
                aria-hidden
                className="flex-none text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white group-hover:translate-x-0.5 transition"
              >
                →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
