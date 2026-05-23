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
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
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
        <ul className="space-y-4">
          {posts.map((b) => (
            <li key={b.id}>
              <Link
                href={`/blog/${b.slug}`}
                className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-neutral-500">
                    {formatDateKo(b.publishedAt)}
                  </span>
                  {b.tags && (
                    <span className="text-[10px] text-neutral-400 truncate">
                      · {b.tags}
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-semibold leading-snug mb-1">
                  {b.title}
                </h2>
                {b.excerpt && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                    {b.excerpt}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
