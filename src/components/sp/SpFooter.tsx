// sportspredictions.live 푸터 — 데이터 출처(스코어베이스) 한 방향 링크. 도박 유도 문구 없음.
import Link from "next/link";
import { SCOREBASE_EN, SP_NAME } from "@/lib/sp/site";

export default function SpFooter() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--sp-border)" }}>
      <div className="sp-container flex flex-col gap-3 py-8 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ color: "var(--sp-fg-dim)" }}>
        <p>
          © {new Date().getFullYear()} {SP_NAME}. Predictions are statistical estimates, not guarantees.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/methodology" className="hover:underline">Methodology</Link>
          <Link href="/about" className="hover:underline">About</Link>
          <a href={SCOREBASE_EN} className="hover:underline" target="_blank" rel="noopener noreferrer">
            Data &amp; full analysis by Scorebase
          </a>
        </nav>
      </div>
    </footer>
  );
}
