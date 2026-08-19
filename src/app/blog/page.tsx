// 블로그 목록 — 스포츠 데이터 분석 인사이트 글 모음.
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import AmbientGlow from "@/components/AmbientGlow";
import BoardTabs from "@/components/BoardTabs";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)

const PAGE_SIZE = 21; // 3열 그리드 × 7행

// searchParams 를 읽는 순간 라우트가 동적이 되어 export const revalidate 가 무력해진다.
// 목록 쿼리를 unstable_cache 로 감싸 10분 캐시를 유지한다(odds 페이지와 같은 패턴).
// 총 개수와 목록을 나눠 캐시한다 — 먼저 총 개수로 페이지 번호를 접어야 봇이 ?page=9999 를
// 긁어도 쓸모없는 빈 목록 캐시가 쌓이지 않는다.
const loadTotal = () =>
  unstable_cache(() => prisma.blog.count(), ["blog-count"], { revalidate: 600 })();

// unstable_cache 는 값을 JSON 으로 굳힌다 — Date 를 그대로 넣으면 캐시 히트 때 문자열로 돌아와
// b.publishedAt.toISOString() 이 터진다(캐시 미스인 첫 요청만 되고 그 뒤 10분간 500).
// 캐시 경계에서 ISO 문자열로 정규화해 두고, 표시할 때만 Date 로 되돌린다.
const loadPosts = (page: number) =>
  unstable_cache(
    async () => {
      const rows = await prisma.blog.findMany({
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, slug: true, title: true, excerpt: true,
          thumbnailUrl: true, tags: true, publishedAt: true,
        },
      });
      return rows.map((r) => ({ ...r, publishedAt: r.publishedAt.toISOString() }));
    },
    // 키는 캐시에 담기는 값의 형태와 함께 간다 — 형태를 바꾸면서 키를 그대로 두면 옛 값이
    // 새 코드에 그대로 흘러들어 화면이 빈다(개발 중 실측).
    ["blog-posts", String(page)],
    { revalidate: 600 },
  )();

/** 요청 page 를 1~마지막 페이지로 접는다. 본문과 메타가 같은 값을 써야 canonical 이 어긋나지 않는다. */
async function resolvePage(raw: string | undefined): Promise<{ page: number; totalPages: number; total: number }> {
  const total = await loadTotal();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(raw) || 1), totalPages);
  return { page, totalPages, total };
}

const BASE_META: Metadata = {
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
  openGraph: {
    title: "스코어베이스 블로그 — 스포츠 데이터 분석 인사이트",
    description: "데이터로 보는 스포츠 — 통계·시뮬레이션·AI 예측 인사이트",
    url: `${SITE_URL}/blog`,
    type: "website",
  },
};

/** 2페이지 이상은 자기 URL 을 canonical 로 — 1페이지로 몰면 뒤쪽 글이 색인에서 사라진다. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page } = await resolvePage((await searchParams).page);
  if (page === 1) return { ...BASE_META, alternates: { canonical: `${SITE_URL}/blog` } };
  return {
    ...BASE_META,
    title: `스코어베이스 블로그 (${page}페이지) — 스포츠 데이터 분석 인사이트`,
    alternates: { canonical: `${SITE_URL}/blog?page=${page}` },
    openGraph: { ...BASE_META.openGraph, url: `${SITE_URL}/blog?page=${page}` },
  };
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // 범위를 넘는 page 는 마지막 페이지로 접는다 — 빈 화면 대신 실제 글을 보여준다.
  const { page, totalPages, total } = await resolvePage((await searchParams).page);
  const posts = await loadPosts(page);

  // Blog 구조화 데이터 — 검색엔진이 블로그 글 목록을 인식·크롤하게(글 발견 + 색인 보조).
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "스코어베이스 블로그",
    description:
      "글로벌 스포츠 데이터 분석과 통계 인사이트, AI 예측 모델 활용법을 다루는 스포츠 데이터 분석 블로그.",
    url: `${SITE_URL}/blog`,
    blogPost: posts.map((b) => ({
      "@type": "BlogPosting",
      headline: b.title,
      url: `${SITE_URL}/blog/${b.slug}`,
      datePublished: b.publishedAt,
      ...(b.excerpt ? { description: b.excerpt } : {}),
      ...(b.thumbnailUrl ? { image: b.thumbnailUrl } : {}),
    })),
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(blogLd) }}
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
        <div className="mt-6">
          <BoardTabs active="blog" />
        </div>
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

      {totalPages > 1 && (
        <>
          <p className="mt-8 text-center text-xs text-neutral-500 tabular-nums">
            전체 {total}편 중 {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + posts.length}
          </p>
          <Pager page={page} totalPages={totalPages} />
        </>
      )}
    </main>
  );
}

/** 이전/다음 + 페이지 번호(현재 기준 최대 7개 윈도우). admin/users 의 Pager 와 같은 형태. */
function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  const start = Math.max(1, Math.min(page - 3, totalPages - 6));
  const end = Math.min(totalPages, start + 6);
  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  const href = (n: number) => (n === 1 ? "/blog" : `/blog?page=${n}`);
  const base = "px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap";
  const idle =
    "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700";
  const off = "text-neutral-300 dark:text-neutral-700";

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 mt-4" aria-label="블로그 페이지">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${base} ${idle}`} rel="prev">
          ← 이전
        </Link>
      ) : (
        <span className={`${base} ${off}`}>← 이전</span>
      )}

      {start > 1 && (
        <>
          <Link href={href(1)} className={`${base} ${idle}`}>
            1
          </Link>
          <span className="text-neutral-400 text-sm">…</span>
        </>
      )}

      {nums.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className={`${base} bg-blue-600 text-white font-semibold tabular-nums`}
          >
            {n}
          </span>
        ) : (
          <Link key={n} href={href(n)} className={`${base} ${idle} tabular-nums`}>
            {n}
          </Link>
        ),
      )}

      {end < totalPages && (
        <>
          <span className="text-neutral-400 text-sm">…</span>
          <Link href={href(totalPages)} className={`${base} ${idle} tabular-nums`}>
            {totalPages}
          </Link>
        </>
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} className={`${base} ${idle}`} rel="next">
          다음 →
        </Link>
      ) : (
        <span className={`${base} ${off}`}>다음 →</span>
      )}
    </nav>
  );
}
