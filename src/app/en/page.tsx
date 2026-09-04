// app__page (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  ChevronRight,
  Dice5,
  FileText,
  HeartPulse,
  Radio,
  Satellite,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { toEnglishTeamName } from "@/lib/i18n/en";
import ArticleCard from "@/components/en/ArticleCard";
import HeroSection from "@/components/en/HeroSection";
import MyTeamsStrip from "@/components/en/MyTeamsStrip";
import HomeFocusCards from "@/components/en/HomeFocusCards";
import HomeAiInsightShowcase from "@/components/en/HomeAiInsightShowcase";
import HomeAiScorecardShowcase from "@/components/en/HomeAiScorecardShowcase";
import SectionHeading from "@/components/en/SectionHeading";
import SeasonInsight from "@/components/en/SeasonInsight";
import SeasonInsightCard from "@/components/en/SeasonInsightCard";
import { jsonLdScript, organizationLd, orgRef } from "@/lib/seo/jsonld";

// 1시간마다 ISR 재생성 — Monte Carlo 시뮬레이션 비용 흡수 + SEO 친화
export const revalidate = 3600;

// 메인 페이지 canonical 은 항상 www 버전으로 고정 (apex 는 redirect)
const CANONICAL = "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "Scorebase — AI sports analysis built on statistics",
  description:
    "Matches read in numbers, not hunches. Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, MLS, KBO, NBA, MLB, NHL and the 2026 FIFA World Cup — an Elo model and multiple AI systems working through global sports data every day.",
  keywords: [
    "Scorebase", "Scorebase",
    "AI sports analysis", "AI data analysis", "sports data analysis",
    "sports insight", "match insight", "fixture insight",
    "match preview", "match review", "sports preview", "sports review",
    "injury list", "football injuries", "NBA injuries", "MLB injuries",
    "EPL table", "Premier League table", "MLB standings", "NBA standings", "NHL standings",
    "LaLiga table", "Bundesliga table", "Serie A table", "Champions League table",
    "Elo rating", "win probability", "season projection", "match results",
    "sports media",
    "KBO", "KBO League", "KBO standings", "Korean baseball",
    "FIFA World Cup", "World Cup 2026", "North American World Cup", "South Korea World Cup",
  ],
  alternates: {
    canonical: `${CANONICAL}/en`,
    // 영어판(/en) hreflang 상호 연결
    languages: {
      ko: CANONICAL,
      en: `${CANONICAL}/en`,
      "x-default": CANONICAL,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: `${CANONICAL}/en`,
    siteName: "Scorebase",
    title: "Scorebase — matches read in numbers, not hunches",
    description:
      "Premier League, LaLiga, Bundesliga, KBO, NBA, MLB, NHL and the 2026 World Cup — analysed daily by an Elo model and multiple AI systems.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Scorebase — an AI sports media banner showing wireframe football, basketball, baseball and hockey puck over dark-toned data visualisation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Scorebase — matches read in numbers, not hunches",
    description:
      "Premier League, LaLiga, Bundesliga, KBO, NBA, MLB, NHL and the 2026 World Cup — analysed daily by an Elo model and multiple AI systems.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

// 조직 본체 — 한국어 홈과 같은 단일 @id. 이름은 "스코어베이스" 하나로 두고 영문명은 alternateName.
const organizationJsonLd = organizationLd({
  description:
    "AI-driven sports media — Premier League, NBA, MLB and NHL previews, reviews, injury lists and match insight",
  inLanguage: "en",
});

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Scorebase",
  alternateName: "Scorebase",
  url: CANONICAL,
  inLanguage: "en",
  publisher: orgRef(),
  potentialAction: {
    "@type": "SearchAction",
    target: `${CANONICAL}/en/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Scorebase?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scorebase is a data-analysis sports publication where AI generates and updates match previews, reviews, injury lists and Elo-based match insight every day for the Premier League, LaLiga, Bundesliga, Serie A, NBA, MLB, NHL and more.",
      },
    },
    {
      "@type": "Question",
      name: "How is a Scorebase match insight built?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We normalise recognised data sources such as football-data.org and ESPN, then combine Elo ratings, goal difference, home/away strength, recent form and head-to-head records in a season simulation to estimate title odds, relegation risk and match win probabilities.",
      },
    },
    {
      "@type": "Question",
      name: "Which leagues does Scorebase cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Nineteen leagues update automatically every day — football (Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, K League, J League and others), baseball (KBO, NPB, MLB), basketball (NBA), ice hockey (NHL) and esports (LCK).",
      },
    },
    {
      "@type": "Question",
      name: "Is Scorebase a gambling or betting site?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Scorebase is a data-analysis sports publication and has nothing to do with gambling or betting. Every win and title probability is reference information produced by a statistical model.",
      },
    },
  ],
};

export default async function Home() {
  const latest = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 12,
  });

  const restLatest: typeof latest = [];
  const hasAny = latest.length > 0;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }}
      />

      <HeroSection />

      {/* 내 팀 바로가기 — 즐겨찾기 팀 보유 방문자만 렌더 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-5">
        <MyTeamsStrip />
      </div>

      <HomeFocusCards />

      <HomeAiInsightShowcase />

      <HomeAiScorecardShowcase />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        <FeaturesSection />

        <RecentUpdatesSection />

        {!hasAny && <EmptyState />}

        {restLatest.length > 0 && (
          <section>
            <SectionHeading
              title="Latest match reviews and previews"
              subtitle="Match insight across 19 leagues, updated daily"
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {restLatest.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading
            title="Season insight — title odds from Elo"
            subtitle="Current form and season simulations across 19 leagues at a glance"
            href="/en/predictions"
            hrefLabel="Prediction dashboard"
          />

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

          <div className="grid md:grid-cols-2 gap-5">
            <SeasonInsight league="EPL" />
            <SeasonInsight league="MLB" />
          </div>
        </section>

        <LeagueDirectory />

        <MethodologySection />

        <FaqSection />

        <section className="pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            From live scores to season projections — sports media built on data
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Scorebase brings live scores and match data for the Premier League, LaLiga, Bundesliga, Serie A, MLB, NBA, NHL, KBO and NPB into one place. Elo ratings, Monte Carlo simulation and head-to-head records turn each fixture and each season outlook into something you can read in numbers.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            Today's fixtures are on{" "}
            <Link href="/en/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              live scores
            </Link>
            , the pre-match numbers sit in the{" "}
            <Link href="/en/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              prediction dashboard
            </Link>
            , and{" "}
            <Link href="/en/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              injury lists
            </Link>{" "}
            plus{" "}
            <Link href="/en/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              league tables
            </Link>{" "}
            refresh automatically every day. There is also the{" "}
            <Link href="/en/standings/KBO" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              KBO table
            </Link>{" "}
            and the{" "}
            <Link href="/en/transfers" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              transfer market
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// 섹션 컴포넌트
// ============================================================

type UpdateItem = {
  tag: string;
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  href: string;
  cta: string;
};

async function RecentUpdatesSection() {
  // AI Strong Pick 적중률 — DB 실시간 산출(하드코딩 금지, 적중률 보드와 동일 소스).
  // 리그별 Strong Pick 임계(strong-pick.ts) 초과 매치의 리그별 적중률 top 3 (표본 30+). 1시간 ISR 로 비용 흡수.
  const spMatches = await prisma.match.findMany({
    where: { predCorrect: { not: null } },
    select: { league: true, predCorrect: true, predHome: true, predDraw: true, predAway: true },
  });
  const spByLeague = new Map<string, { hit: number; total: number }>();
  for (const m of spMatches) {
    const top = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
    if (top < strongPickThreshold(m.league)) continue;
    const e = spByLeague.get(m.league) ?? { hit: 0, total: 0 };
    e.total++;
    if (m.predCorrect) e.hit++;
    spByLeague.set(m.league, e);
  }
  const topStrong = [...spByLeague.entries()]
    .filter(([, e]) => e.total >= 30)
    .map(([league, e]) => ({ league, rate: Math.round((e.hit / e.total) * 100) }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);
  const strongBody =
    topStrong.length >= 2
      ? `We track only the matches that clear a league-specific confidence threshold — ${topStrong.map((t) => `${t.league} ${t.rate}%`).join(", ")} correct, backtested across every finished match.`
      : "We track only the matches that clear a league-specific confidence threshold. The real hit rate is published live on the accuracy board.";

  const items: UpdateItem[] = [
    {
      tag: "NEW",
      Icon: Trophy,
      title: "AI scorecard · our model vs GPT-5.6",
      body: "Two AI systems predict the same fixtures before kick-off and are scored on the result. Every hit and miss is published, match by match, and the World Cup, MLB and NBA are added automatically each day.",
      href: "/en/predictions/scorecard",
      cta: "Open the AI scorecard",
    },
    {
      tag: "NEW",
      Icon: Bot,
      title: "Strong Pick accuracy, in the open",
      body: "Five signals drive the model — team quality, recent momentum, home advantage, public attention and underdog value. Every pick they produce is scored on the real result and published on the accuracy board.",
      href: "/en/predictions/accuracy",
      cta: "See the accuracy board",
    },
    {
      tag: "NEW",
      Icon: Radio,
      title: "Scorebase live scores",
      body: "Live, finished and upcoming matches across 19 leagues — Premier League, KBO, NPB, MLB, NBA, NHL, Champions League, LCK and more — on one page.",
      href: "/en/scores",
      cta: "Open live scores",
    },
    {
      tag: "NEW",
      Icon: Star,
      title: "AI Strong Pick · where the model is most confident",
      body: strongBody,
      href: "/en/predictions/accuracy",
      cta: "Open the accuracy board",
    },
    {
      tag: "NEW",
      Icon: Sparkles,
      title: "Bookmaker odds vs the AI model",
      body: "Each article shows the average implied probability across several bookmakers next to our own model. Where the model is 5pp or more ahead of the market, the outcome is flagged as a value bet.",
      href: "/en/predictions/accuracy",
      cta: "Value bet statistics",
    },
    {
      tag: "UPGRADE",
      Icon: Target,
      title: "Five prediction markets tracked at once",
      body: "1X2, double chance, over/under, handicap and BTTS, applied automatically by sport. Accuracy is published openly from a 1,233-match backtest.",
      href: "/en/predictions/accuracy",
      cta: "Accuracy by league",
    },
    {
      tag: "UPGRADE",
      Icon: BarChart3,
      title: "A sharper statistical model",
      body: "Elo now carries margin-of-victory weighting, and football handicaps use a Skellam distribution. Wider winning margins move the rating further, and handicap accuracy holds steadier.",
      href: "/en/predictions/accuracy",
      cta: "How the model works",
    },
  ];
  return (
    <section aria-labelledby="updates-title">
      <SectionHeading
        title="Recent updates"
        subtitle="A step past bare results — verified against data and compared with the market"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <UpdateCard key={it.title} item={it} />
        ))}
      </div>
    </section>
  );
}

function UpdateCard({ item }: { item: UpdateItem }) {
  const Icon = item.Icon;
  const tagTone =
    item.tag === "NEW"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/20"
      : "bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/20";
  return (
    <article className="group flex flex-col rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tagTone}`}
        >
          {item.tag}
        </span>
        <Icon className="h-5 w-5 text-zinc-700 dark:text-white/80" />
      </div>
      <h3 className="mb-2 text-base font-semibold leading-snug tracking-tight text-zinc-950 dark:text-white">
        {item.title}
      </h3>
      <p className="mb-4 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-white/55">
        {item.body}
      </p>
      <Link
        href={item.href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
      >
        {item.cta}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </article>
  );
}

function FeaturesSection() {
  const items: Array<{
    Icon: React.ComponentType<{ className?: string }>;
    title: string;
    body: React.ReactNode;
  }> = [
    {
      Icon: FileText,
      title: "match preview",
      body: (
        <>
          Before kick-off, our{" "}
          <strong className="text-zinc-950 dark:text-white">
            match preview
          </strong>{" "}
          combines Elo ratings, recent form and home/away strength so you can see
          each side's edge and the estimated win probability in advance.
        </>
      ),
    },
    {
      Icon: HeartPulse,
      title: "injury list",
      body: (
        <>
          We track each club's{" "}
          <strong className="text-zinc-950 dark:text-white">
            injury list
          </strong>{" "}
          and how much each absence matters, so the variables that swing a result
          are visible before the whistle.
        </>
      ),
    },
    {
      Icon: Bot,
      title: "In-depth AI match analysis",
      body: (
        <>
          Elo ratings, season simulations and head-to-head records come together
          in an{" "}
          <strong className="text-zinc-950 dark:text-white">
            AI match insight
          </strong>{" "}
          that lets you watch with the data in hand.
        </>
      ),
    },
  ];
  return (
    <section aria-labelledby="features-title">
      <SectionHeading
        title="Three things Scorebase works through every day"
        subtitle="From recognised data sources to Elo, simulation and in-depth AI match analysis"
      />
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {items.map(({ Icon, title, body }) => (
          <article
            key={title}
            className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
          >
            <Icon className="mb-5 h-7 w-7 text-zinc-900 dark:text-white" />
            <h3 className="mb-2 text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
              {title}
            </h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
              {body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// 월드컵 배너 카피 — 마지막 매치(=결승) DB 상태로 자동 판정 (날짜 짐작 금지, 1h ISR 갱신).
// 결승 전 = 대진 예고 + AI 우위, 진행 중 = LIVE, 종료 = 실제 스코어 기반 우승팀 결산.
async function wcBannerCopy(): Promise<{ badge: string; title: string; sub: string; href: string }> {
  const final = await prisma.match.findFirst({
    where: { league: "WORLD_CUP", status: { in: ["SCHEDULED", "LIVE", "FINISHED"] } },
    orderBy: { startTime: "desc" },
    select: {
      status: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      predHome: true,
      predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const done = {
    badge: "FIFA World Cup 2026",
    title: "World Cup 2026 wrap-up",
    sub: "Final bracket, title-odds trend and the best XI from each group",
    href: "/en/predictions",
  };
  if (!final) return done;
  const home = toEnglishTeamName(final.homeTeam.name);
  const away = toEnglishTeamName(final.awayTeam.name);
  if (final.status === "FINISHED") {
    const winner =
      final.homeScore != null && final.awayScore != null && final.homeScore !== final.awayScore
        ? final.homeScore > final.awayScore
          ? home
          : away
        : null;
    return winner ? { ...done, title: `World Cup 2026 wrap-up — ${winner} champions` } : done;
  }
  if (final.status === "LIVE") {
    return {
      badge: "FIFA World Cup 2026 · FINAL",
      title: `World Cup final live — ${home} vs ${away}`,
      sub: "Live score and AI title odds at a glance",
      href: "/en/predictions",
    };
  }
  const kst = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(final.startTime);
  const favored =
    final.predHome != null && final.predAway != null
      ? final.predHome > final.predAway
        ? `${home} ${Math.round(final.predHome * 100)}%`
        : `${away} ${Math.round(final.predAway * 100)}%`
      : null;
  return {
    badge: "FIFA World Cup 2026 · FINAL",
    title: `World Cup final — ${home} vs ${away}`,
    sub: `Kick-off ${kst} KST${favored ? ` · AI favours ${favored}` : ""} — bracket and title odds at a glance`,
    href: "/en/predictions",
  };
}

async function LeagueDirectory() {
  const wcBanner = await wcBannerCopy();
  const tiles = [
    { href: "/en/standings/EPL", name: "Premier League", sub: "EPL · England" },
    { href: "/en/standings/LALIGA", name: "LaLiga", sub: "Spain" },
    { href: "/en/standings/BUNDESLIGA", name: "Bundesliga", sub: "Germany" },
    { href: "/en/standings/SERIE_A", name: "Serie A", sub: "Italy" },
    { href: "/en/standings/LIGUE_1", name: "Ligue 1", sub: "France" },
    { href: "/en/standings/UCL", name: "Champions League", sub: "Europe" },
    { href: "/en/standings/MLS", name: "MLS", sub: "North America" },
    { href: "/en/standings/NBA", name: "NBA", sub: "US basketball" },
    { href: "/en/standings/KBO", name: "KBO League", sub: "Korean baseball" },
    { href: "/en/standings/NPB", name: "NPB League", sub: "Japanese baseball" },
    { href: "/en/standings/MLB", name: "MLB", sub: "Major League Baseball" },
    { href: "/en/standings/NHL", name: "NHL", sub: "North American ice hockey" },
    { href: "/en/standings/LOL", name: "LCK", sub: "League of Legends Korea" },
  ];
  return (
    <section aria-labelledby="leagues-title">
      <SectionHeading
        title="Match insight by league"
        subtitle="Jump straight to previews, reviews and season analysis for any league"
      />

      {/* 월드컵 강조 카드 — 대회 단계별 카피 (wcBannerCopy) */}
      <Link
        href={wcBanner.href}
        className="group relative mb-4 block overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_60%)]" />
        <div className="flex flex-col gap-3 px-5 py-5 text-white sm:flex-row sm:items-center sm:gap-5">
          <Trophy className="h-9 w-9 shrink-0 drop-shadow" aria-hidden />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-85">
              {wcBanner.badge}
            </div>
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              {wcBanner.title}
            </div>
            <div className="mt-0.5 text-xs opacity-90 sm:text-sm">
              {wcBanner.sub}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold sm:ml-auto">
            <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
              Predictions / matches / analysis
            </span>
            <ChevronRight
              className="h-4 w-4 transition group-hover:translate-x-1"
              aria-hidden
            />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex flex-col items-start gap-1 rounded-[1.25rem] bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
          >
            <strong className="text-sm font-semibold tracking-tight text-zinc-950 transition group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
              {t.name}
            </strong>
            <small className="text-[11px] text-zinc-500 dark:text-white/45">{t.sub}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MethodologySection() {
  const items: Array<{
    Icon: React.ComponentType<{ className?: string }>;
    title: string;
    body: string;
  }> = [
    {
      Icon: Satellite,
      title: "Data sources",
      body: "Recognised sports data sources such as football-data.org and ESPN are normalised, and results, statistics and fixtures are collected daily.",
    },
    {
      Icon: BarChart3,
      title: "Elo rating",
      body: "Elo ratings quantify each team's strength and update after every match, forming the basis for win probability estimates.",
    },
    {
      Icon: Dice5,
      title: "Season simulation",
      body: "The remaining fixtures are simulated repeatedly by Monte Carlo to produce title, relegation and play-off probabilities.",
    },
  ];
  return (
    <section aria-labelledby="method-title">
      <SectionHeading
        title="How Scorebase analyses"
        subtitle="Every number comes straight out of a statistical model"
        href="/en/predictions/accuracy"
        hrefLabel="Read more"
      />
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
          >
            <Icon className="mb-4 h-6 w-6 text-zinc-900 dark:text-white" />
            <h3 className="mb-2 text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">
              {title}
            </h3>
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-white/55">
              {body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs = [
    {
      q: "What is Scorebase?",
      a: "Scorebase is a data-analysis sports publication where AI generates and updates match previews, reviews, injury lists and Elo-based match insight every day for the Premier League, LaLiga, Bundesliga, Serie A, NBA, MLB, NHL and more.",
    },
    {
      q: "How is a match insight built?",
      a: "We normalise recognised data sources such as football-data.org and ESPN, then combine Elo ratings, goal difference, home/away strength, recent form and head-to-head records in a season simulation to estimate title odds, relegation risk and match win probabilities.",
    },
    {
      q: "Which leagues do you cover?",
      a: "Nineteen leagues update automatically every day — football (Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, K League, J League and others), baseball (KBO, NPB, MLB), basketball (NBA), ice hockey (NHL) and esports (LCK).",
    },
    {
      q: "Is this a gambling or betting site?",
      a: "No. Scorebase is a data-analysis sports publication and has nothing to do with gambling or betting. Every win and title probability is reference information produced by a statistical model.",
    },
  ];
  return (
    <section aria-labelledby="faq-title">
      <SectionHeading title="Frequently asked questions" />
      <div className="space-y-3">
        {faqs.map((f) => (
          <details
            key={f.q}
            className="group rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-black/5 transition open:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-zinc-950 dark:text-white [&::-webkit-details-marker]:hidden">
              <span>{f.q}</span>
              <span
                className="inline-flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full text-lg leading-none text-zinc-400 transition-transform duration-200 group-open:rotate-45 dark:text-white/40"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-white/55">
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-dashed border-zinc-300 p-12 text-center dark:border-white/15">
      <Activity className="mx-auto mb-3 h-6 w-6 text-zinc-400 dark:text-white/40" />
      <p className="text-lg font-semibold text-zinc-950 dark:text-white">
        No articles published yet
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-white/50">
        Automatically generated articles will appear here shortly.
      </p>
    </div>
  );
}
