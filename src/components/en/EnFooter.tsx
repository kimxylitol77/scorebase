// 영어판(/en) 전용 푸터 — 핵심 링크 + 한국어판 안내.
import Link from "next/link";

export default function EnFooter() {
  return (
    <footer className="mt-12 border-t border-neutral-200 dark:border-neutral-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4 text-sm text-neutral-500 dark:text-neutral-400">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/en" className="hover:text-neutral-900 dark:hover:text-white transition">
            Home
          </Link>
          <Link href="/en/scores" className="hover:text-neutral-900 dark:hover:text-white transition">
            Scores
          </Link>
          <Link href="/en/standings" className="hover:text-neutral-900 dark:hover:text-white transition">
            Standings
          </Link>
          <Link href="/en/predictions" className="hover:text-neutral-900 dark:hover:text-white transition">
            Predictions
          </Link>
          <Link href="/en/injuries" className="hover:text-neutral-900 dark:hover:text-white transition">
            Injuries
          </Link>
          <Link href="/en/transfers" className="hover:text-neutral-900 dark:hover:text-white transition">
            Transfers
          </Link>
          <Link href="/" className="hover:text-neutral-900 dark:hover:text-white transition">
            한국어 (Korean site)
          </Link>
        </div>

        {/* 연봉·랭킹·통계 — 헤더에 다 넣기엔 많아 푸터에서 묶어 노출한다 */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <Link href="/en/salaries/soccer" className="hover:text-neutral-900 dark:hover:text-white transition">
            Football wages
          </Link>
          <Link href="/en/salaries/mlb" className="hover:text-neutral-900 dark:hover:text-white transition">
            MLB salaries
          </Link>
          <Link href="/en/salaries/nba" className="hover:text-neutral-900 dark:hover:text-white transition">
            NBA salaries
          </Link>
          <Link href="/en/salaries/nhl" className="hover:text-neutral-900 dark:hover:text-white transition">
            NHL salaries
          </Link>
          <Link href="/en/salaries/f1" className="hover:text-neutral-900 dark:hover:text-white transition">
            F1 salaries
          </Link>
          <Link href="/en/salaries/tennis" className="hover:text-neutral-900 dark:hover:text-white transition">
            Tennis prize money
          </Link>
          <Link href="/en/salaries/golf" className="hover:text-neutral-900 dark:hover:text-white transition">
            Golf prize money
          </Link>
          <Link href="/en/rankings/tennis" className="hover:text-neutral-900 dark:hover:text-white transition">
            Tennis rankings
          </Link>
          <Link href="/en/rankings/f1" className="hover:text-neutral-900 dark:hover:text-white transition">
            F1 standings
          </Link>
          <Link href="/en/rankings/ufc" className="hover:text-neutral-900 dark:hover:text-white transition">
            UFC rankings
          </Link>
          <Link href="/en/rankings/value-clubs" className="hover:text-neutral-900 dark:hover:text-white transition">
            Value for money clubs
          </Link>
          <Link href="/en/over-under" className="hover:text-neutral-900 dark:hover:text-white transition">
            Over/Under stats
          </Link>
          <Link href="/en/predictions/club-ranking" className="hover:text-neutral-900 dark:hover:text-white transition">
            World club rankings
          </Link>
          <Link href="/en/predictions/title-race" className="hover:text-neutral-900 dark:hover:text-white transition">
            Title races
          </Link>
          <Link href="/en/national-teams" className="hover:text-neutral-900 dark:hover:text-white transition">
            World Cup nations
          </Link>
        </div>
        <p className="text-xs leading-relaxed">
          Scorebase provides data-driven sports analysis powered by Elo ratings, market odds and
          statistical models. Predictions are probabilistic estimates, not guarantees — please use
          them responsibly. The full experience, including articles and live scores, is available on
          the Korean site.
        </p>
        <p className="text-xs">© {new Date().getFullYear()} Scorebase — scorebase.kr</p>
      </div>
    </footer>
  );
}
