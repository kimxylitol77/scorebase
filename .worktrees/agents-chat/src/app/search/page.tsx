import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import SearchInput from "@/components/SearchInput";
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
    // SQLite 의 contains — 한글 부분 일치 검색에 충분
    articles = await prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ title: { contains: q } }, { content: { contains: q } }],
      },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">검색</h1>
        <p className="mt-1 text-sm text-neutral-500">
          제목·본문에서 단어가 포함된 기사를 찾아 줍니다.
        </p>
      </header>

      <div className="mb-8">
        <SearchInput defaultValue={q} variant="full" autoFocus />
      </div>

      {q.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 text-sm">
          검색어를 입력해주세요.
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 text-sm">
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
