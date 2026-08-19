// 커뮤니티 보드 통합 탭 — 스포츠 분석·자유게시판·해외 뉴스·블로그·공지를 한 탭 바로 묶는다.
// analysis/news/blog/notices 네 페이지가 공유해 어느 글에서든 나머지 보드로 넘나든다(헤더 메뉴 1개로 통일).

import Link from "next/link";

const TABS = [
  { key: "analysis", label: "스포츠 분석", href: "/analysis" },
  { key: "free", label: "자유게시판", href: "/analysis?board=free" },
  { key: "briefing", label: "해외 뉴스", href: "/news" },
  { key: "blog", label: "블로그", href: "/blog" },
  { key: "notices", label: "공지사항", href: "/notices" },
] as const;

export type BoardTabKey = (typeof TABS)[number]["key"];

export default function BoardTabs({ active }: { active: BoardTabKey }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-[1.5rem] border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            active === t.key
              ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
              : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
