// 전역 404 — 영어 기본 화면("404: This page could not be found") 대신 한국어 안내 + 주요 목적지.
import Link from "next/link";

export default function NotFound() {
  const chips = [
    { href: "/scores", label: "라이브 스코어" },
    { href: "/world-cup", label: "2026 월드컵" },
    { href: "/predictions", label: "AI 예측" },
    { href: "/search", label: "검색" },
  ];
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-rose-500">
          404 Not Found
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight break-keep">
          페이지를 찾을 수 없습니다
        </h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          주소가 바뀌었거나 삭제된 페이지입니다. 아래에서 이어서 둘러보세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition dark:bg-white dark:text-neutral-900"
          >
            홈으로
          </Link>
          {chips.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-full border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
