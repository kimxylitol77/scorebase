// 글 상세 페이지 하단의 관련 글 추천.
// 같은 리그의 최근 글 6건 (현재 글 제외).

import { prisma } from "@/lib/db";
import ArticleCard from "./ArticleCard";

interface Props {
  league: string;
  currentId: number;
}

export default async function RelatedArticles({ league, currentId }: Props) {
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      league,
      NOT: { id: currentId },
    },
    orderBy: { publishedAt: "desc" },
    take: 6,
  });

  if (articles.length === 0) return null;

  return (
    <section className="mt-16 pt-10 border-t border-neutral-200 dark:border-neutral-800">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-lg font-bold tracking-tight">{league} 다른 기사</h2>
        <span className="text-xs text-neutral-500">최근 발행 순</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} variant="compact" />
        ))}
      </div>
    </section>
  );
}
