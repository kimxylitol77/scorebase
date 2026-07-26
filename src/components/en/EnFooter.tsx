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
          <Link href="/en/standings" className="hover:text-neutral-900 dark:hover:text-white transition">
            Standings
          </Link>
          <Link href="/en/predictions" className="hover:text-neutral-900 dark:hover:text-white transition">
            Predictions
          </Link>
          <Link href="/" className="hover:text-neutral-900 dark:hover:text-white transition">
            한국어 (Korean site)
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
