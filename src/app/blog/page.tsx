// 블로그 목록 — 스포츠 데이터 분석 인사이트 글 모음.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";

export const revalidate = 600; // 10분

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "스코어베이스 블로그 — 스포츠 데이터 분석 인사이트",
  description:
    "EPL · KBO · NBA · MLB 등 글로벌 스포츠 데이터 분석, 통계 인사이트, AI 모델 활용법을 다룹니다.",
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "스코어베이스 블로그",
    description: "데이터로 보는 스포츠 — 인사이트와 분석",
    url: `${SITE_URL}/blog`,
    type: "website",
  },
};

export default async function BlogPage() {
  const posts = await prisma.blog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <header className="mb-10">
        <p className="text-sm text-neutral-500 mb-2">스코어베이스 블로그</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          데이터로 보는 스포츠
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          EPL · KBO · NBA · MLB · NHL 등 글로벌 스포츠 데이터 분석, Elo · 시뮬레이션 ·
          AI 모델 활용 인사이트를 담습니다.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500 py-12 text-center">
          아직 등록된 글이 없습니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.map((b) => (
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
                <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-2 min-w-0">
                  <span className="shrink-0 whitespace-nowrap">
                    {formatDateKo(b.publishedAt)}
                  </span>
                  {b.tags && (
                    <span className="truncate min-w-0">· {b.tags}</span>
                  )}
                </div>
                <h2 className="text-sm sm:text-base font-semibold leading-snug mb-2 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                  {b.title}
                </h2>
                {b.excerpt && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                    {b.excerpt}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
