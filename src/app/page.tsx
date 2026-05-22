import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Dice5,
  Radio,
  Satellite,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import HeroSection from "@/components/HeroSection";
import SectionHeading from "@/components/SectionHeading";
import SeasonInsight from "@/components/SeasonInsight";
import SeasonInsightCard from "@/components/SeasonInsightCard";

// 1시간마다 ISR 재생성 — Monte Carlo 시뮬레이션 비용 흡수 + SEO 친화
export const revalidate = 3600;

// 메인 페이지 canonical 은 항상 www 버전으로 고정 (apex 는 redirect)
const CANONICAL = "https://www.scorebase.kr";

export const metadata: Metadata = {
  title: "스코어베이스 (Scorebase) — 통계 기반 AI 스포츠 분석",
  description:
    "감이 아니라, 숫자로 보는 경기. EPL · 라리가 · 분데스리가 · 세리에A · 리그앙 · UCL · MLS · KBO · NBA · MLB · NHL · FIFA 월드컵 2026 — Elo 모델과 멀티 AI가 매일 분석하는 글로벌 스포츠 데이터 미디어.",
  keywords: [
    "스코어베이스", "Scorebase",
    "AI 스포츠 분석", "AI 데이터 분석", "스포츠 데이터 분석",
    "스포츠 인사이트", "매치 인사이트", "경기 인사이트",
    "경기 프리뷰", "경기 리뷰", "스포츠 프리뷰", "스포츠 리뷰",
    "부상자 명단", "축구 부상자", "NBA 부상자", "MLB 부상자",
    "EPL 순위", "프리미어리그 순위", "MLB 순위", "NBA 순위", "NHL 순위",
    "라리가 순위", "분데스리가 순위", "세리에A 순위", "챔피언스리그 순위",
    "Elo 레이팅", "승률 예측", "시즌 예측", "경기 결과",
    "스포츠 미디어",
    "KBO", "KBO 리그", "KBO 순위", "한국 프로야구",
    "FIFA 월드컵", "월드컵 2026", "북중미 월드컵", "대한민국 월드컵",
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: CANONICAL,
    siteName: "스코어베이스",
    title: "스코어베이스 — 감이 아니라, 숫자로 보는 경기",
    description:
      "EPL · 라리가 · 분데스 · KBO · NBA · MLB · NHL · FIFA 월드컵 2026 — Elo 모델과 멀티 AI가 매일 분석.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "스코어베이스 — 다크 톤 데이터 시각화 위에 축구공·농구공·야구공·아이스하키 퍽이 와이어프레임으로 표현된 AI 스포츠 미디어 배너",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "스코어베이스 — 감이 아니라, 숫자로 보는 경기",
    description:
      "EPL · 라리가 · 분데스 · KBO · NBA · MLB · NHL · FIFA 월드컵 2026 — Elo 모델과 멀티 AI가 매일 분석.",
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

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "스코어베이스",
  alternateName: ["Scorebase", "스코어 베이스", "Score Base"],
  url: CANONICAL,
  logo: `${CANONICAL}/icon.png`,
  description:
    "AI 데이터 분석 기반 스포츠 미디어 — EPL·NBA·MLB·NHL 프리뷰·리뷰·부상자 명단·매치 인사이트",
  inLanguage: "ko-KR",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "스코어베이스",
  alternateName: "Scorebase",
  url: CANONICAL,
  inLanguage: "ko-KR",
  publisher: { "@type": "Organization", name: "스코어베이스" },
  potentialAction: {
    "@type": "SearchAction",
    target: `${CANONICAL}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "스코어베이스는 어떤 사이트인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "스코어베이스(Scorebase)는 EPL·라리가·분데스리가·세리에A·NBA·MLB·NHL 등 글로벌 스포츠의 매치 프리뷰, 리뷰, 부상자 명단, Elo 레이팅 기반 매치 인사이트를 AI가 매일 자동 생성하고 업데이트하는 데이터 분석 스포츠 미디어입니다.",
      },
    },
    {
      "@type": "Question",
      name: "스코어베이스의 매치 인사이트는 어떻게 만들어지나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "football-data.org, ESPN 등 공인 데이터 소스를 정규화한 뒤, Elo 레이팅·득실 차·홈/원정 강도·최근 흐름·H2H 전적을 결합해 시즌 시뮬레이션을 돌려 우승 확률·강등 확률·매치 승률을 추정합니다.",
      },
    },
    {
      "@type": "Question",
      name: "스코어베이스에서 어떤 리그를 다루나요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "축구는 EPL(프리미어리그), 라리가, 분데스리가, 세리에A, 리그앙, MLS, UEFA 챔피언스리그를 다룹니다. 그 외에 NBA(농구), MLB(야구), NHL(아이스하키)까지 총 10개 리그를 매일 자동 업데이트합니다.",
      },
    },
    {
      "@type": "Question",
      name: "스코어베이스는 도박·베팅 사이트인가요?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "아닙니다. 스코어베이스는 데이터 분석 기반의 스포츠 미디어이며, 도박·베팅과는 무관합니다. 모든 승률·우승 확률 수치는 통계 모델 기반의 참고용 정보입니다.",
      },
    },
  ],
};

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
      take: 12,
    }),
    getArticlesByLeague("EPL", 3),
    getArticlesByLeague("NBA", 3),
    getArticlesByLeague("NHL", 3),
    getArticlesByLeague("MLB", 3),
  ]);

  const restLatest = latest.slice(0, 6);
  const hasAny = latest.length > 0;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <HeroSection />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        <FeaturesSection />

        <RecentUpdatesSection />

        {!hasAny && <EmptyState />}

        {restLatest.length > 0 && (
          <section>
            <SectionHeading
              title="최신 매치 리뷰·프리뷰"
              subtitle="10개 리그의 매치 인사이트를 매일 자동 업데이트"
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
            title="시즌 인사이트 — Elo 기반 우승 확률"
            subtitle="10개 리그의 현재 흐름과 시즌 시뮬레이션 결과를 한 눈에"
            href="/predictions"
            hrefLabel="예측 대시보드"
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

        <LeagueDirectory />

        <MethodologySection />

        <FaqSection />

        <section className="pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            라이브스코어부터 시즌 예측까지 — 데이터 스포츠 미디어
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            스코어베이스는 EPL, 라리가, 분데스리가, 세리에 A, MLB, NBA, NHL, KBO, NPB 등 주요 리그의 실시간 라이브스코어와 경기 데이터를 한 곳에서 제공하는 스포츠 미디어입니다. Elo 레이팅·Monte Carlo 시뮬레이션·H2H 상대 전적으로 매 경기의 흐름과 시즌 전망을 데이터 기반으로 정리합니다.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
            오늘 경기는{" "}
            <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              라이브스코어
            </Link>
            , 경기 전 분석은{" "}
            <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              프리뷰
            </Link>
            , 종료 후 결과는{" "}
            <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              리뷰
            </Link>
            에서 확인할 수 있습니다.{" "}
            <Link href="/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              부상자 명단
            </Link>
            과{" "}
            <Link href="/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              리그별 분석
            </Link>
            은 매일 자동 갱신됩니다.
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

function RecentUpdatesSection() {
  const items: UpdateItem[] = [
    {
      tag: "NEW",
      Icon: Radio,
      title: "스코어베이스 라이브스코어",
      body: "13개 리그 (EPL · KBO · NPB · MLB · NBA · NHL · UCL · LCK 등) 라이브 / 종료 / 예정 매치를 한 페이지에.",
      href: "/scores",
      cta: "라이브 스코어 보기",
    },
    {
      tag: "NEW",
      Icon: Star,
      title: "AI Strong Pick · 65% 이상 자신 있는 픽",
      body: "모델이 강하게 찍은 매치만 따로 추적 — NBA 62%, NHL 61%, MLB 52% 적중. 전체 평균 대비 +13%p 리프트.",
      href: "/predictions/accuracy",
      cta: "적중률 보드 보기",
    },
    {
      tag: "NEW",
      Icon: Sparkles,
      title: "베팅사이트 odds vs AI 모델 비교",
      body: "글마다 8개 베팅사이트 평균 implied 확률을 우리 모델과 나란히 표시. 모델이 시장보다 5%p+ 자신 있는 결과는 Value Bet 으로 강조.",
      href: "/predictions/accuracy",
      cta: "Value Bet 통계",
    },
    {
      tag: "UPGRADE",
      Icon: Target,
      title: "예측 시장 5종 동시 추적",
      body: "1X2 · 더블 찬스 · OVER/UNDER · 핸디캡 · BTTS — 종목별 자동 적용. 1,233매치 백테스트 기준 적중률 투명 공개.",
      href: "/predictions/accuracy",
      cta: "리그별 적중률",
    },
    {
      tag: "UPGRADE",
      Icon: BarChart3,
      title: "통계 모델 정밀화",
      body: "Elo 마진 가중치(MoV) + 축구 핸디캡 Skellam 분포 적용. 골 차이가 큰 매치는 Elo 변동이 더 크고, 핸디캡 정확도도 안정.",
      href: "/about",
      cta: "방법론 상세",
    },
  ];
  return (
    <section aria-labelledby="updates-title">
      <SectionHeading
        title="최근 업데이트 · 사이트 차별화"
        subtitle="단순 결과 정리에서 한 발 더 — 데이터로 검증하고 시장과 비교합니다"
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
  const items: Array<{ href: string; title: string; body: React.ReactNode }> = [
    {
      href: "/scores",
      title: "라이브스코어",
      body: (
        <>
          13개 리그의{" "}
          <strong className="text-zinc-950 dark:text-white">실시간 점수·진행 상태</strong>
          를 한 페이지에. 라이브 / 종료 / 예정 매치를 자동 분류해 보여줍니다.
        </>
      ),
    },
    {
      href: "/predictions",
      title: "시즌 예측 대시보드",
      body: (
        <>
          Elo 레이팅 + Monte Carlo 1,000회 시뮬레이션으로 산출한{" "}
          <strong className="text-zinc-950 dark:text-white">우승·플레이오프·강등 확률</strong>
          을 19개 리그별로 확인합니다.
        </>
      ),
    },
    {
      href: "/previews",
      title: "프리뷰 모음",
      body: (
        <>
          경기 시작 전, 양 팀 전력·최근 폼·홈 원정 강도를 종합한{" "}
          <strong className="text-zinc-950 dark:text-white">매치 프리뷰</strong>
          를 매일 자동 발행합니다.
        </>
      ),
    },
    {
      href: "/injuries",
      title: "부상자 명단",
      body: (
        <>
          팀별{" "}
          <strong className="text-zinc-950 dark:text-white">부상자 / 결장 명단</strong>
          과 매치 영향도를 추적해 결과를 좌우하는 변수를 미리 파악합니다.
        </>
      ),
    },
  ];
  return (
    <section aria-labelledby="features-title">
      <SectionHeading
        title="스코어베이스가 매일 분석하는 4가지"
        subtitle="공인 데이터 소스에서 Elo · 시뮬레이션 · AI 스포츠 경기 심층 분석까지"
      />
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(({ href, title, body }) => (
          <Link
            key={title}
            href={href}
            className="group flex flex-col rounded-[1.5rem] sm:rounded-[2rem] bg-zinc-100 p-5 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.07]"
          >
            <h3 className="mb-2 text-base font-semibold tracking-tight text-zinc-950 dark:text-white">
              {title}
            </h3>
            <p className="flex-1 text-sm leading-relaxed text-zinc-600 dark:text-white/55">
              {body}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition group-hover:text-zinc-950 dark:text-white/70 dark:group-hover:text-white">
              바로가기
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function LeagueDirectory() {
  const tiles = [
    { href: "/leagues/EPL", name: "프리미어리그", sub: "EPL · 잉글랜드" },
    { href: "/leagues/LALIGA", name: "라리가", sub: "스페인" },
    { href: "/leagues/BUNDESLIGA", name: "분데스리가", sub: "독일" },
    { href: "/leagues/SERIE_A", name: "세리에 A", sub: "이탈리아" },
    { href: "/leagues/LIGUE_1", name: "리그 1", sub: "프랑스" },
    { href: "/leagues/UCL", name: "챔피언스리그", sub: "유럽" },
    { href: "/leagues/MLS", name: "MLS", sub: "북미" },
    { href: "/leagues/NBA", name: "NBA", sub: "미국 농구" },
    { href: "/leagues/KBO", name: "KBO 리그", sub: "한국 프로야구" },
    { href: "/leagues/NPB", name: "NPB 리그", sub: "일본 프로야구" },
    { href: "/leagues/MLB", name: "MLB", sub: "메이저리그" },
    { href: "/leagues/NHL", name: "NHL", sub: "북미 아이스하키" },
    { href: "/leagues/LOL", name: "LCK", sub: "리그 오브 레전드 한국" },
  ];
  return (
    <section aria-labelledby="leagues-title">
      <SectionHeading
        title="리그별 매치 인사이트"
        subtitle="원하는 리그의 프리뷰·리뷰·시즌 분석으로 바로 이동"
      />

      {/* 월드컵 강조 카드 — 개막 임박 */}
      <Link
        href="/leagues/WORLD_CUP"
        className="group relative mb-4 block overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_60%)]" />
        <div className="flex flex-col gap-3 px-5 py-5 text-white sm:flex-row sm:items-center sm:gap-5">
          <Trophy className="h-9 w-9 shrink-0 drop-shadow" aria-hidden />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-85">
              FIFA World Cup 2026 · LIVE SOON
            </div>
            <div className="text-lg font-semibold tracking-tight sm:text-xl">
              북중미 월드컵 — 6/11 개막
            </div>
            <div className="mt-0.5 text-xs opacity-90 sm:text-sm">
              한국 첫 경기 6/12 11:00 KST vs 체코 · 우승 후보·조별 통과 확률 보러가기
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold sm:ml-auto">
            <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
              예측 / 매치 / 분석
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
      title: "데이터 출처",
      body: "football-data.org, ESPN 등 공인 스포츠 데이터 소스를 정규화하여 경기 결과·통계·일정을 매일 수집합니다.",
    },
    {
      Icon: BarChart3,
      title: "Elo 레이팅",
      body: "팀별 강도를 정량화하는 Elo 레이팅을 매 경기 갱신해 매치 승률 추정의 기준으로 활용합니다.",
    },
    {
      Icon: Dice5,
      title: "시즌 시뮬레이션",
      body: "남은 일정을 Monte Carlo 방식으로 반복 시뮬레이션해 우승·강등·플레이오프 진출 확률을 산출합니다.",
    },
  ];
  return (
    <section aria-labelledby="method-title">
      <SectionHeading
        title="스코어베이스의 분석 방법론"
        subtitle="모든 숫자는 통계 모델에서 직접 산출됩니다"
        href="/about"
        hrefLabel="자세히 보기"
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
      q: "스코어베이스는 어떤 사이트인가요?",
      a: "스코어베이스(Scorebase)는 EPL·라리가·분데스리가·세리에A·NBA·MLB·NHL 등 글로벌 스포츠의 매치 프리뷰, 리뷰, 부상자 명단, Elo 레이팅 기반 매치 인사이트를 AI가 매일 자동 생성·업데이트하는 데이터 분석 스포츠 미디어입니다.",
    },
    {
      q: "매치 인사이트는 어떻게 만들어지나요?",
      a: "football-data.org, ESPN 등 공인 데이터 소스를 정규화한 뒤, Elo 레이팅·득실 차·홈/원정 강도·최근 흐름·H2H 전적을 결합해 시즌 시뮬레이션을 돌려 우승 확률·강등 확률·매치 승률을 추정합니다.",
    },
    {
      q: "어떤 리그를 다루나요?",
      a: "축구는 EPL(프리미어리그), 라리가, 분데스리가, 세리에A, 리그앙, MLS, UEFA 챔피언스리그를 다룹니다. 그 외에 NBA(농구), MLB(야구), NHL(아이스하키)까지 총 10개 리그를 매일 자동 업데이트합니다.",
    },
    {
      q: "도박·베팅 사이트인가요?",
      a: "아닙니다. 스코어베이스는 데이터 분석 기반의 스포츠 미디어이며, 도박·베팅과는 무관합니다. 모든 승률·우승 확률 수치는 통계 모델 기반의 참고용 정보입니다.",
    },
  ];
  return (
    <section aria-labelledby="faq-title">
      <SectionHeading title="자주 묻는 질문" />
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} variant="compact" />
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
        아직 발행된 기사가 없습니다
      </p>
      <p className="mt-2 text-sm text-zinc-500 dark:text-white/50">
        잠시 후 자동 생성된 기사가 표시될 예정입니다.
      </p>
    </div>
  );
}
