// 통합 검색 — 팀·선수·리그 검색 결과.
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import SearchInput from "@/components/SearchInput";
import AmbientGlow from "@/components/AmbientGlow";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `"${q}" 검색 결과` : "검색",
    description: "Scorebase 사이트 안에서 기사를 검색합니다.",
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  let articles: Awaited<ReturnType<typeof prisma.article.findMany>> = [];
  if (q.length >= 1) {
    // Postgres contains + 대소문자 무시 — 소문자 영문 검색("arsenal")이 전멸하던 버그 수정
    articles = await prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
  }

  return (
    <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <AmbientGlow />
      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 통합 검색
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">검색</h1>
        <p className="mt-4 text-sm leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          제목·본문에서 단어가 포함된 기사를 찾아 줍니다.
        </p>
      </header>

      <div className="mb-8">
        <SearchInput defaultValue={q} variant="full" autoFocus />
      </div>

      {q.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 text-sm break-keep">
          검색어를 입력해주세요.
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 text-sm break-keep">
          <p className="text-base font-semibold text-neutral-700 dark:text-neutral-300">
            &ldquo;{q}&rdquo; 검색 결과가 없습니다
          </p>
          <p className="mt-2 text-xs">
            다른 키워드로 시도해보세요. (팀명·리그명·선수명 등)
          </p>
        </div>
      ) : (
        <>
          <div className="text-sm text-neutral-500 mb-4">
            <strong className="text-neutral-700 dark:text-neutral-300">
              &ldquo;{q}&rdquo;
            </strong>{" "}
            결과 {articles.length}건
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
