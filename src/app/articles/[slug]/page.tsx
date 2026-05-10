import { prisma } from "@/lib/db";
import Markdown from "@/components/Markdown";
import LeagueBadge from "@/components/LeagueBadge";
import MatchInsight from "@/components/MatchInsight";
import InjuryAndKeyPlayers from "@/components/InjuryAndKeyPlayers";
import RelatedArticles from "@/components/RelatedArticles";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatDateKo } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

const TYPE_BADGE: Record<
  string,
  { label: string; cls: string; icon: string }
> = {
  PREVIEW: {
    label: "프리뷰",
    icon: "🔮",
    cls: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  },
  RECAP: {
    label: "리뷰",
    icon: "📝",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  },
  ANALYSIS: {
    label: "분석",
    icon: "📊",
    cls: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/20",
  },
};

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const SITE_NAME = process.env.SITE_NAME ?? "Scorebase";

function makeDescription(content: string): string {
  return content
    .replace(/[#*_`>\[\]\(\)]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

// 종목별 평균 매치 시간 (분) — endDate 추정용
const MATCH_DURATION_MIN: Record<string, number> = {
  EPL: 110, LALIGA: 110, BUNDESLIGA: 110, SERIE_A: 110,
  LIGUE_1: 110, MLS: 110, UCL: 110, WORLD_CUP: 120,
  NBA: 150, NHL: 150,
  MLB: 180, KBO: 200,
};

// 리그별 홈 국가/지역 — Place location 의 addressCountry 보강
const LEAGUE_COUNTRY: Record<string, { name: string; code: string }> = {
  EPL:        { name: "England",      code: "GB" },
  LALIGA:     { name: "Spain",        code: "ES" },
  BUNDESLIGA: { name: "Germany",      code: "DE" },
  SERIE_A:    { name: "Italy",        code: "IT" },
  LIGUE_1:    { name: "France",       code: "FR" },
  MLS:        { name: "United States", code: "US" },
  UCL:        { name: "Europe",       code: "EU" },
  WORLD_CUP:  { name: "USA / Canada / Mexico", code: "US" },
  NBA:        { name: "United States", code: "US" },
  NHL:        { name: "United States", code: "US" },
  MLB:        { name: "United States", code: "US" },
  KBO:        { name: "South Korea",  code: "KR" },
};

interface MatchForEvent {
  homeTeam: { name: string };
  awayTeam: { name: string };
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  raw?: string | null;
}

function buildSportsEventJsonLd(opts: {
  match: MatchForEvent;
  league: string;
  articleTitle: string;
  description: string;
  url: string;
  siteUrl: string;
}) {
  const { match, league, articleTitle, description, url, siteUrl } = opts;
  const home = match.homeTeam.name;
  const away = match.awayTeam.name;
  const start = match.startTime;
  const durationMin = MATCH_DURATION_MIN[league] ?? 120;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const country = LEAGUE_COUNTRY[league];

  // 매치 raw JSON 안에 venue 정보가 있으면 추출 (api-football / api-baseball 등)
  let venueName: string | undefined;
  let venueCity: string | undefined;
  if (match.raw) {
    try {
      const r = JSON.parse(match.raw);
      // api-football: fixture.venue.{name, city}
      // api-baseball: 보통 없음
      // football-data: 매치 객체에 venue (string)
      venueName =
        r?.fixture?.venue?.name ??
        r?.venue?.name ??
        (typeof r?.venue === "string" ? r.venue : undefined);
      venueCity = r?.fixture?.venue?.city ?? r?.venue?.city;
    } catch {}
  }

  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home} vs ${away}`,
    description,
    url,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventStatus:
      match.status === "FINISHED"
        ? "https://schema.org/EventCompleted"
        : match.status === "POSTPONED"
          ? "https://schema.org/EventPostponed"
          : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    sport: league,
    location: {
      "@type": "Place",
      name: venueName ?? `${home} 홈 경기장`,
      address: {
        "@type": "PostalAddress",
        addressLocality: venueCity ?? home,
        addressCountry: country?.code ?? "US",
      },
    },
    homeTeam: { "@type": "SportsTeam", name: home },
    awayTeam: { "@type": "SportsTeam", name: away },
    competitor: [
      { "@type": "SportsTeam", name: home },
      { "@type": "SportsTeam", name: away },
    ],
    performer: [
      { "@type": "SportsTeam", name: home },
      { "@type": "SportsTeam", name: away },
    ],
    image: [`${siteUrl}/og-image.png`],
    organizer: {
      "@type": "Organization",
      name: country?.name ? `${league} (${country.name})` : league,
    },
    offers: {
      "@type": "Offer",
      url,
      price: "0",
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      validFrom: start.toISOString(),
      category: "free analysis",
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await prisma.article.findUnique({
    where: { slug },
    select: { title: true, content: true, league: true, publishedAt: true },
  });
  if (!article) return { title: "기사를 찾을 수 없습니다" };

  const desc = makeDescription(article.content);
  const url = `${SITE_URL}/articles/${slug}`;

  return {
    title: article.title,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: desc,
      url,
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      publishedTime: article.publishedAt?.toISOString(),
      section: article.league,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: desc,
    },
    other: {
      "article:section": article.league,
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      match: { include: { homeTeam: true, awayTeam: true } },
    },
  });

  if (!article || article.status !== "PUBLISHED") notFound();

  const date = formatDateKo(article.publishedAt ?? article.createdAt);
  const url = `${SITE_URL}/articles/${slug}`;
  const desc = makeDescription(article.content);

  // JSON-LD 구조화 데이터 (NewsArticle / SportsEvent)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: desc,
    image: [`${SITE_URL}/og-image.png`],
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/og-image.png`,
      },
    },
    datePublished: (article.publishedAt ?? article.createdAt).toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "ko-KR",
    articleSection: article.league,
  };

  const eventJsonLd = article.match
    ? buildSportsEventJsonLd({
        match: article.match,
        league: article.league,
        articleTitle: article.title,
        description: desc,
        url,
        siteUrl: SITE_URL,
      })
    : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Scorebase", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: article.league,
        item: `${SITE_URL}/leagues/${article.league}`,
      },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {eventJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="mb-6">
        <Link
          href={`/leagues/${article.league}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← {article.league}
        </Link>
      </div>

      <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <LeagueBadge league={article.league} size="md" />
        {(() => {
          const badge = TYPE_BADGE[article.type];
          return badge ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold ring-1 ring-inset text-xs ${badge.cls}`}
            >
              <span>{badge.icon}</span>
              {badge.label}
            </span>
          ) : (
            <span className="text-neutral-500 font-medium">{article.type}</span>
          );
        })()}
        <span className="text-neutral-500">{date}</span>
      </div>

      {article.match && (
        <div className="mb-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 sm:p-6 bg-neutral-50 dark:bg-neutral-900">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            {/* 홈 팀 */}
            <Link
              href={`/teams/${article.match.homeTeam.id}`}
              className="group flex flex-col items-center text-center hover:opacity-90 transition"
            >
              <TeamLogo
                src={article.match.homeTeam.logoUrl}
                name={article.match.homeTeam.name}
              />
              <div className="mt-2 font-semibold text-sm sm:text-base group-hover:underline truncate max-w-full">
                {article.match.homeTeam.name}
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 font-medium">
                🏠 홈
              </div>
            </Link>

            {/* 스코어 */}
            <div className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight whitespace-nowrap">
              {article.match.homeScore ?? "-"}
              <span className="text-neutral-400 mx-2 sm:mx-3">:</span>
              {article.match.awayScore ?? "-"}
            </div>

            {/* 원정 팀 */}
            <Link
              href={`/teams/${article.match.awayTeam.id}`}
              className="group flex flex-col items-center text-center hover:opacity-90 transition"
            >
              <TeamLogo
                src={article.match.awayTeam.logoUrl}
                name={article.match.awayTeam.name}
              />
              <div className="mt-2 font-semibold text-sm sm:text-base group-hover:underline truncate max-w-full">
                {article.match.awayTeam.name}
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 font-medium">
                ✈ 원정
              </div>
            </Link>
          </div>
        </div>
      )}

      <Markdown>{article.content}</Markdown>

      {/* AI 작성 disclosure + 데이터 출처 */}
      <AiDisclosure league={article.league} type={article.type} />

      {article.match && <MatchInsight match={article.match} />}

      {article.match && (
        <InjuryAndKeyPlayers
          league={article.league}
          homeTeamName={article.match.homeTeam.name}
          awayTeamName={article.match.awayTeam.name}
          matchStartTime={article.match.startTime}
        />
      )}

      <RelatedArticles league={article.league} currentId={article.id} />

      <div className="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-sm">
        <Link
          href="/"
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← 메인으로
        </Link>
        <Link
          href={`/leagues/${article.league}`}
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          {article.league} 더 보기 →
        </Link>
      </div>
    </article>
  );
}

/** 팀 로고 — logoUrl 없으면 이니셜 마크로 폴백 */
function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    // 외부 이미지 — next/image 도메인 설정 부담 회피 위해 img 태그 사용
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={`${name} 로고`}
        width={56}
        height={56}
        loading="lazy"
        className="w-14 h-14 sm:w-16 sm:h-16 object-contain bg-white rounded-md p-1.5 shadow-sm"
      />
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center text-2xl font-black text-neutral-500"
      aria-label={`${name} 로고 없음`}
    >
      {initial}
    </div>
  );
}

/* =====================================================================
 * AI 작성 disclosure + 데이터 출처 footer
 * Google E-E-A-T / 투명성 가이드 부합. AI 콘텐츠 명시 + 출처 인용으로
 * Scaled content abuse 처벌 위험 회피.
 * ===================================================================*/
const DATA_SOURCES_BY_LEAGUE: Record<string, string[]> = {
  // 축구 - football-data.org + api-football Pro + The Odds API
  EPL:        ["football-data.org", "api-football Pro", "The Odds API"],
  LALIGA:     ["api-football Pro", "ESPN", "The Odds API"],
  BUNDESLIGA: ["api-football Pro", "ESPN", "The Odds API"],
  SERIE_A:    ["api-football Pro", "ESPN", "The Odds API"],
  LIGUE_1:    ["api-football Pro", "ESPN", "The Odds API"],
  MLS:        ["api-football Pro", "ESPN", "The Odds API"],
  UCL:        ["api-football Pro", "ESPN", "The Odds API"],
  WORLD_CUP:  ["api-football Pro", "eloratings.net (시드 Elo)"],
  // 야구
  MLB:        ["api-sports baseball Pro", "MLB Stats API (선발 투수)", "The Odds API"],
  KBO:        ["api-sports baseball Pro"],
  // 농구·하키
  NBA:        ["ESPN", "The Odds API"],
  NHL:        ["NHL 공식 API (api-web.nhle.com)", "ESPN", "The Odds API"],
};

function AiDisclosure({ league, type }: { league: string; type: string }) {
  const sources = DATA_SOURCES_BY_LEAGUE[league] ?? ["공식 스포츠 데이터"];
  const typeLabel =
    type === "PREVIEW" ? "프리뷰" : type === "RECAP" ? "리뷰" : "분석";

  return (
    <aside className="mt-8 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 px-5 py-4 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">🤖</span>
        <div className="space-y-1">
          <p>
            <strong className="text-neutral-700 dark:text-neutral-300">
              AI · 데이터 협업 작성
            </strong>{" "}
            본 {typeLabel} 글은 데이터 분석 모델(Elo 레이팅 · Monte Carlo
            시뮬레이션 · 마켓 odds blending)과 AI(OpenAI gpt-4o-mini)가
            협업해 작성됐으며, 운영진의 모니터링 하에 발행됩니다.
          </p>
          <p>
            <strong className="text-neutral-700 dark:text-neutral-300">데이터 출처</strong>
            {" — "}
            {sources.join(" · ")}. 모든 통계는 매치 시점 기준으로
            계산되며 결과는 모델 추정치로 베팅 결과를 보장하지 않습니다.
          </p>
        </div>
      </div>
    </aside>
  );
}
