// 목록 페이지네이션 — 게시판(/analysis)과 같은 원형 번호 스타일.
// 페이지가 많아도 앞뒤 몇 개와 처음·끝만 보여주고 나머지는 "…" 로 접는다.
// href 생성은 페이지마다 쿼리가 달라 prop 으로 받는다.
import Link from "next/link";

/** 현재 페이지 주변 + 처음·끝만 남긴 페이지 번호 목록. 7쪽 이하면 전부 보여준다. */
function pageList(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

const ARROW =
  "px-3.5 py-2 rounded-full text-sm ring-1 ring-black/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10";
const NUM =
  "px-4 py-2 rounded-full text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

export default function Pagination({
  cur,
  totalPages,
  href,
}: {
  cur: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex justify-center items-center gap-1.5 mt-8" aria-label="페이지">
      {cur > 1 && (
        <Link href={href(cur - 1)} className={ARROW} aria-label="이전 페이지">
          ‹
        </Link>
      )}
      {pageList(cur, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-neutral-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === cur ? "page" : undefined}
            className={`${NUM} ${
              p === cur
                ? "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
                : "ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"
            }`}
          >
            {p}
          </Link>
        ),
      )}
      {cur < totalPages && (
        <Link href={href(cur + 1)} className={ARROW} aria-label="다음 페이지">
          ›
        </Link>
      )}
    </nav>
  );
}
