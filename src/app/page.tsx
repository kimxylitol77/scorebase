import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import FeaturedArticle from "@/components/FeaturedArticle";
import HeroSection from "@/components/HeroSection";
import SectionHeading from "@/components/SectionHeading";
import SeasonInsight from "@/components/SeasonInsight";
import SeasonInsightCard from "@/components/SeasonInsightCard";

// 1시간마다 ISR 재생성 — Monte Carlo 시뮬레이션 비용 흡수 + SEO 친화
export const revalidate = 3600;

async function getArticlesByLeague(league: string, take = 4) {
  return prisma.article.findMany({
    where: { status: "PUBLISHED", league },
    orderBy: { publishedAt: "desc" },
    take,
  });
}

export default async function Home() {
  const [latest, eplPicks, nbaPicks, nhlPicks, mlbPicks] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 13,
    }),
    getArticlesByLeague("EPL", 3),
    getArticlesByLeague("NBA", 3),
    getArticlesByLeague("NHL", 3),
    getArticlesByLeague("MLB", 3),
  ]);

  const featured = latest[0];
  const restLatest = latest.slice(1, 7);
  const hasAny = latest.length > 0;

  const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Scorebase",
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description:
      "EPL · 라리가 · 분데스리가 · 세리에 A · 리그 1 · MLS · UCL · NBA · MLB · NHL 의 경기 결과·프리뷰·분석을 매일 자동 업데이트하는 데이터 기반 스포츠 미디어.",
  };
  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Scorebase",
    url: SITE_URL,
    inLanguage: "ko-KR",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/leagues/{search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
      <HeroSection />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {!hasAny && <EmptyState />}

        {featured && (
          <section>
            <SectionHeading
              title="오늘의 픽"
              subtitle="가장 최근에 발행된 기사"
            />
            <FeaturedArticle article={featured} />
          </section>
        )}

        {restLatest.length > 0 && (
          <section>
            <SectionHeading title="최신 기사" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restLatest.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        )}

        {/* 시즌 인사이트 — 모든 리그 컴팩트 카드 + 핵심 2개 풀카드 */}
        <section>
          <SectionHeading
            title="시즌 인사이트"
            subtitle="10개 리그의 현재 흐름을 한 눈에"
            href="/predictions"
            hrefLabel="예측 대시보드"
          />

          {/* 컴팩트 카드 — 모든 리그 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <SeasonInsightCard league="EPL" />
            <SeasonInsightCard league="LALIGA" />
            <SeasonInsightCard league="BUNDESLIGA" />
            <SeasonInsightCard league="SERIE_A" />
            <SeasonInsightCard league="LIGUE_1" />
            <SeasonInsightCard league="UCL" />
            <SeasonInsightCard league="MLS" />
            <SeasonInsightCard league="NBA" />
            <SeasonInsightCard league="MLB" />
            <SeasonInsightCard league="NHL" />
          </div>

          {/* 풀카드 — 가장 풍부한 EPL/MLB 깊은 분석 */}
          <div className="grid md:grid-cols-2 gap-5 items-start">
            <SeasonInsight league="EPL" />
            <SeasonInsight league="MLB" />
          </div>
        </section>

        {eplPicks.length > 0 && (
          <LeagueShelf
            league="EPL"
            title="프리미어리그"
            subtitle="잉글리시 풋볼의 최신 흐름"
            articles={eplPicks}
          />
        )}

        {nbaPicks.length > 0 && (
          <LeagueShelf
            league="NBA"
            title="NBA"
            subtitle="미국 프로농구 매치 리뷰"
            articles={nbaPicks}
          />
        )}

        {nhlPicks.length > 0 && (
          <LeagueShelf
            league="NHL"
            title="NHL"
            subtitle="북미 아이스하키의 최신 매치 결과"
            articles={nhlPicks}
          />
        )}

        {mlbPicks.length > 0 && (
          <LeagueShelf
            league="MLB"
            title="MLB"
            subtitle="메이저리그 야구의 최신 결과·한국 선수 활약"
            articles={mlbPicks}
          />
        )}
      </div>
    </div>
  );
}

function LeagueShelf({
  league,
  title,
  subtitle,
  articles,
}: {
  league: string;
  title: string;
  subtitle: string;
  articles: Array<{
    id: number;
    slug: string;
    title: string;
    league: string;
    type: string;
    publishedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return (
    <section>
      <SectionHeading
        title={title}
        subtitle={subtitle}
        href={`/leagues/${league}`}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} variant="compact" />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-12 text-center">
      <p className="text-lg font-semibold">아직 발행된 기사가 없습니다</p>
      <p className="mt-2 text-sm text-neutral-500">
        잠시 후 자동 생성된 기사가 표시될 예정입니다.
      </p>
    </div>
  );
}
