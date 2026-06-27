// 블로그 목록 — 스포츠 데이터 분석 인사이트 글 모음.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 600; // 10분

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "스코어베이스 블로그 — 스포츠 데이터 분석 인사이트",
  description:
    "EPL·KBO·NBA·MLB·NHL 등 글로벌 스포츠 데이터 분석과 통계 인사이트, Elo·몬테카를로 시뮬레이션, AI 예측 모델 활용법을 다루는 스포츠 데이터 분석 블로그입니다.",
  keywords: [
    "스포츠 데이터 분석",
    "스포츠 통계 블로그",
    "축구 데이터 분석",
    "야구 통계 분석",
    "AI 스포츠 예측",
    "EPL 통계",
    "KBO 분석",
    "스코어베이스 블로그",
  ],
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: "스코어베이스 블로그 — 스포츠 데이터 분석 인사이트",
    description: "데이터로 보는 스포츠 — 통계·시뮬레이션·AI 예측 인사이트",
    url: `${SITE_URL}/blog`,
    type: "website",
  },
};

export default async function BlogPage() {
  const posts = await prisma.blog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  // Blog 구조화 데이터 — 검색엔진이 블로그 글 목록을 인식·크롤하게(글 발견 + 색인 보조).
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "스코어베이스 블로그",
    description:
      "글로벌 스포츠 데이터 분석과 통계 인사이트, AI 예측 모델 활용법을 다루는 스포츠 데이터 분석 블로그.",
    url: `${SITE_URL}/blog`,
    blogPost: posts.slice(0, 20).map((b) => ({
      "@type": "BlogPosting",
      headline: b.title,
      url: `${SITE_URL}/blog/${b.slug}`,
      datePublished: b.publishedAt.toISOString(),
      ...(b.excerpt ? { description: b.excerpt } : {}),
      ...(b.thumbnailUrl ? { image: b.thumbnailUrl } : {}),
    })),
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />
      <AmbientGlow />
      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 블로그
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          데이터로 보는 스포츠
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-3 break-keep">
          EPL · KBO · NBA · MLB · NHL 등 글로벌 스포츠 데이터 분석과 통계 인사이트를 다루는
          블로그입니다. Elo 레이팅 · 몬테카를로 시뮬레이션 · AI 예측 모델 활용법부터 선수·팀
          심층 분석까지, 데이터로 스포츠를 읽는 글을 모았습니다.
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
              className="group block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md dark:hover:border-neutral-700 dark:hover:bg-white/[0.06]"
            >
              {b.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.thumbnailUrl}
                  alt=""
                  className="w-full h-40 object-cover group-hover:opacity-90 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
                <h2 className="text-sm sm:text-base font-semibold leading-snug mb-2 line-clamp-2 break-keep group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
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
