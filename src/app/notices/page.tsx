import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";

export const revalidate = 600; // 10분

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { tab } = await searchParams;
  if (tab === "blog") {
    return {
      title: "스코어베이스 블로그 — 스포츠 데이터 분석",
      description:
        "EPL · KBO · NBA · MLB 등 글로벌 스포츠 데이터 분석, Elo · 시뮬레이션 · AI 모델 인사이트.",
      alternates: { canonical: `${SITE_URL}/notices?tab=blog` },
    };
  }
  return {
    title: "공지사항 · 패치노트 · 블로그",
    description:
      "스코어베이스 사이트 업데이트, 새 기능, 모델 개선, 블로그 글을 한 곳에서.",
    alternates: { canonical: `${SITE_URL}/notices` },
  };
}

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  CHANGELOG: {
    label: "패치노트",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  NOTICE: {
    label: "공지",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  MAINTENANCE: {
    label: "점검",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

export default async function NoticesPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const activeTab = tab === "blog" ? "blog" : "notice";

  const [notices, blogs, postCount] = await Promise.all([
    prisma.notice.findMany({ orderBy: { publishedAt: "desc" }, take: 50 }),
    prisma.blog.findMany({ orderBy: { publishedAt: "desc" }, take: 50 }),
    prisma.post.count(),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <header className="mb-8">
        <p className="text-sm text-neutral-500 mb-2">사이트 소식</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          공지사항 · 블로그
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          새 기능 · 패치노트와 스코어베이스 데이터 분석 블로그를 한 곳에서.
        </p>
      </header>

      {/* Segment tab */}
      <nav className="mb-6 flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
        <Link
          href="/notices"
          className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
            activeTab === "notice"
              ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          공지 · 패치노트 ({notices.length})
        </Link>
        <Link
          href="/notices?tab=blog"
          className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
            activeTab === "blog"
              ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
              : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          블로그 ({blogs.length})
        </Link>
        <Link
          href="/analysis"
          className="px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          회원분석 ({postCount})
        </Link>
      </nav>

      {/* 공지 list */}
      {activeTab === "notice" && (
        notices.length === 0 ? (
          <p className="text-sm text-neutral-500 py-12 text-center">
            아직 등록된 공지가 없습니다.
          </p>
        ) : (
          <ul className="space-y-3 max-w-3xl">
            {notices.map((n) => {
              const t = TYPE_LABEL[n.type] ?? TYPE_LABEL.NOTICE;
              return (
                <li key={n.id}>
                  <Link
                    href={`/notices/${n.slug}`}
                    className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${t.tone}`}
                      >
                        {t.label}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatDateKo(n.publishedAt)}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold leading-snug">
                      {n.title}
                    </h2>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      )}

      {/* 블로그 카드 grid */}
      {activeTab === "blog" && (
        blogs.length === 0 ? (
          <p className="text-sm text-neutral-500 py-12 text-center">
            아직 등록된 블로그 글이 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {blogs.map((b) => (
              <Link
                key={b.id}
                href={`/blog/${b.slug}`}
                className="group block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-md transition"
              >
                {b.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.thumbnailUrl}
                    alt=""
                    className="w-full h-40 object-cover group-hover:opacity-90 transition"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-40 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-rose-500/10 flex items-center justify-center">
                    <span className="text-2xl font-black text-neutral-400 dark:text-neutral-600 tracking-tight">
                      Scorebase
                    </span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-2">
                    <span>{formatDateKo(b.publishedAt)}</span>
                    {b.tags && (
                      <span className="truncate">· {b.tags}</span>
                    )}
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold leading-snug mb-2 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {b.title}
                  </h3>
                  {b.excerpt && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                      {b.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </main>
  );
}
