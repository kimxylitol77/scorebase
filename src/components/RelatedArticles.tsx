// 글 상세 페이지 하단의 관련 글 추천.
// 같은 리그의 최근 글 6건 (현재 글 제외). 전술 연구(TACTICAL) 글은 같은 시리즈끼리
// 우선 묶는다 — 감독 전술 20편이 서로를 관련 글로 발견하게 (2026-07-18 요청).

import { prisma } from "@/lib/db";
import ArticleCard from "./ArticleCard";

interface Props {
  league: string;
  currentId: number;
  /** 현재 글 타입 — TACTICAL 이면 같은 시리즈 우선 */
  currentType?: string;
}

export default async function RelatedArticles({ league, currentId, currentType }: Props) {
  const isTactical = currentType === "TACTICAL";
  const series = isTactical
    ? await prisma.article.findMany({
        where: { status: "PUBLISHED", league, type: "TACTICAL", NOT: { id: currentId } },
        orderBy: { publishedAt: "desc" },
        take: 6,
      })
    : [];
  const fill = series.length < 6
    ? await prisma.article.findMany({
        where: {
          status: "PUBLISHED",
          league,
          NOT: { id: { in: [currentId, ...series.map((a) => a.id)] } },
          ...(isTactical ? { type: { not: "TACTICAL" } } : {}),
        },
        orderBy: { publishedAt: "desc" },
        take: 6 - series.length,
      })
    : [];
  const articles = [...series, ...fill];

  if (articles.length === 0) return null;

  return (
    <section className="mt-16 pt-10 border-t border-neutral-200 dark:border-neutral-800">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-lg font-bold tracking-tight">
          {isTactical && series.length > 0 ? "다른 감독 전술 연구" : `${league} 다른 기사`}
        </h2>
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
