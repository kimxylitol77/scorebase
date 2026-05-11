import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import FeaturedArticle from "@/components/FeaturedArticle";
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
        {/* ───── 핵심 가치 4가지 — SEO 키워드 자연 노출 ───── */}
        <FeaturesSection />

        {/* ───── 최근 업데이트 — 사이트 차별화 노출 ───── */}
        <RecentUpdatesSection />

        {!hasAny && <EmptyState />}

        {featured && (
          <section>
            <SectionHeading
              title="오늘의 픽"
              subtitle="가장 최근에 발행된 매치 프리뷰·리뷰"
            />
            <FeaturedArticle article={featured} />
          </section>
        )}

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

        {/* 시즌 인사이트 — 모든 리그 컴팩트 카드 + 핵심 2개 풀카드 */}
        <section>
          <SectionHeading
            title="시즌 인사이트 — Elo 기반 우승 확률"
            subtitle="10개 리그의 현재 흐름과 시즌 시뮬레이션 결과를 한 눈에"
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

        {/* ───── 리그별 빠른 진입 ───── */}
        <LeagueDirectory />

        {/* ───── 데이터 방법론 (E-E-A-T 신호) ───── */}
        <MethodologySection />

        {/* ───── FAQ ───── */}
        <FaqSection />
      </div>
    </div>
  );
}

// ============================================================
// 새 섹션 컴포넌트
// ============================================================

function RecentUpdatesSection() {
  const items: Array<{
    tag: string;
    tone: keyof typeof UPDATE_TONES;
    icon: string;
    title: string;
    body: string;
    href: string;
    cta: string;
  }> = [
    {
      tag: "NEW",
      tone: "amber",
      icon: "⭐",
      title: "AI Strong Pick · 65% 이상 자신 있는 픽",
      body: "모델이 강하게 찍은 매치만 따로 추적 — NBA 62%, NHL 61%, MLB 52% 적중. 전체 평균 대비 +13%p 리프트.",
      href: "/predictions/accuracy",
      cta: "적중률 보드 보기",
    },
    {
      tag: "NEW",
      tone: "emerald",
      icon: "✨",
      title: "베팅사이트 odds vs AI 모델 비교",
      body: "글마다 8개 베팅사이트 평균 implied 확률을 우리 모델과 나란히 표시. 모델이 시장보다 5%p+ 자신 있는 결과는 ✨ Value Bet 으로 강조.",
      href: "/predictions/accuracy",
      cta: "Value Bet 통계",
    },
    {
      tag: "UPGRADE",
      tone: "blue",
      icon: "🎯",
      title: "예측 시장 5종 동시 추적",
      body: "1X2 · 더블 찬스 · OVER/UNDER · 핸디캡 · BTTS — 종목별 자동 적용. 1,233매치 백테스트 기준 적중률 투명 공개.",
      href: "/predictions/accuracy",
      cta: "리그별 적중률",
    },
    {
      tag: "UPGRADE",
      tone: "violet",
      icon: "📊",
      title: "통계 모델 정밀화",
      body: "Elo 마진 가중치(MoV) + 축구 핸디캡 Skellam 분포 적용. 골 차이가 큰 매치는 Elo 변동이 더 크고, 핸디캡 정확도도 안정.",
      href: "/about",
      cta: "방법론 상세",
    },
    {
      tag: "AUTOMATION",
      tone: "pink",
      icon: "🔄",
      title: "매일 7회 자동 갱신",
      body: "결과 수집 / 프리뷰 작성 / 리뷰 작성 / 적중 평가 / 시장 odds 수집 — 매치 종료 직후 글이 자동으로 사이트에 올라옵니다.",
      href: "/about",
      cta: "데이터 흐름",
    },
  ];
  return (
    <section aria-labelledby="updates-title">
      <SectionHeading
        title="🆕 최근 업데이트 · 사이트 차별화"
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

const UPDATE_TONES = {
  amber: {
    border: "border-amber-300/60 dark:border-amber-700/40",
    bg: "bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/40 dark:to-orange-950/30",
    tag: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    cta: "text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200",
  },
  emerald: {
    border: "border-emerald-300/60 dark:border-emerald-700/40",
    bg: "bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-950/30",
    tag: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    cta: "text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200",
  },
  blue: {
    border: "border-blue-300/60 dark:border-blue-700/40",
    bg: "bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/40 dark:to-indigo-950/30",
    tag: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    cta: "text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200",
  },
  violet: {
    border: "border-violet-300/60 dark:border-violet-700/40",
    bg: "bg-gradient-to-br from-violet-50/80 to-fuchsia-50/80 dark:from-violet-950/40 dark:to-fuchsia-950/30",
    tag: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
    cta: "text-violet-700 dark:text-violet-400 hover:text-violet-900 dark:hover:text-violet-200",
  },
  pink: {
    border: "border-pink-300/60 dark:border-pink-700/40",
    bg: "bg-gradient-to-br from-pink-50/80 to-rose-50/80 dark:from-pink-950/40 dark:to-rose-950/30",
    tag: "bg-pink-500/15 text-pink-700 dark:text-pink-400",
    cta: "text-pink-700 dark:text-pink-400 hover:text-pink-900 dark:hover:text-pink-200",
  },
} as const;

function UpdateCard({
  item,
}: {
  item: {
    tag: string;
    tone: keyof typeof UPDATE_TONES;
    icon: string;
    title: string;
    body: string;
    href: string;
    cta: string;
  };
}) {
  const t = UPDATE_TONES[item.tone];
  return (
    <article
      className={`rounded-2xl border ${t.border} ${t.bg} p-5 flex flex-col`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${t.tag}`}
        >
          {item.tag}
        </span>
        <span className="text-xl" aria-hidden>
          {item.icon}
        </span>
      </div>
      <h3 className="font-bold text-base text-neutral-900 dark:text-white mb-2 leading-snug">
        {item.title}
      </h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed flex-1 mb-4">
        {item.body}
      </p>
      <Link
        href={item.href}
        className={`inline-flex items-center gap-1 text-xs font-semibold ${t.cta} transition`}
      >
        {item.cta}
        <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

function FeaturesSection() {
  const items = [
    {
      icon: "📝",
      title: "경기 프리뷰",
      body: (
        <>
          경기 시작 전, Elo 레이팅과 최근 폼·홈 원정 강도를 종합한{" "}
          <strong className="text-neutral-900 dark:text-white">
            매치 프리뷰
          </strong>
          로 양 팀의 강점과 추정 승률을 미리 확인하세요.
        </>
      ),
    },
    {
      icon: "🔍",
      title: "경기 리뷰",
      body: (
        <>
          경기 종료 직후 자동 발행되는{" "}
          <strong className="text-neutral-900 dark:text-white">
            스포츠 리뷰
          </strong>
          가 결과·핵심 장면·통계 흐름·다음 경기 영향까지 한 번에 정리합니다.
        </>
      ),
    },
    {
      icon: "🏥",
      title: "부상자 명단",
      body: (
        <>
          팀별{" "}
          <strong className="text-neutral-900 dark:text-white">
            부상자 명단
          </strong>
          과 결장 영향도를 추적해 매치 결과를 좌우하는 변수를 미리 파악할 수
          있게 합니다.
        </>
      ),
    },
    {
      icon: "🤖",
      title: "AI 스포츠 경기 심층 분석",
      body: (
        <>
          Elo 레이팅·시즌 시뮬레이션·H2H 전적 데이터를 결합한{" "}
          <strong className="text-neutral-900 dark:text-white">
            AI 매치 인사이트
          </strong>
          로 데이터 기반 관전을 돕습니다.
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <article
            key={it.title}
            className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
          >
            <div className="text-2xl mb-3" aria-hidden>
              {it.icon}
            </div>
            <h3 className="text-base font-semibold mb-2">{it.title}</h3>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {it.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LeagueDirectory() {
  const tiles = [
    { href: "/leagues/EPL", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", name: "프리미어리그", sub: "EPL · 잉글랜드" },
    { href: "/leagues/LALIGA", flag: "🇪🇸", name: "라리가", sub: "스페인" },
    { href: "/leagues/BUNDESLIGA", flag: "🇩🇪", name: "분데스리가", sub: "독일" },
    { href: "/leagues/SERIE_A", flag: "🇮🇹", name: "세리에 A", sub: "이탈리아" },
    { href: "/leagues/LIGUE_1", flag: "🇫🇷", name: "리그 1", sub: "프랑스" },
    { href: "/leagues/UCL", flag: "🏆", name: "챔피언스리그", sub: "유럽" },
    { href: "/leagues/MLS", flag: "🇺🇸", name: "MLS", sub: "북미" },
    { href: "/leagues/NBA", flag: "🏀", name: "NBA", sub: "미국 농구" },
    { href: "/leagues/KBO", flag: "🇰🇷", name: "KBO 리그", sub: "한국 프로야구" },
    { href: "/leagues/MLB", flag: "⚾", name: "MLB", sub: "메이저리그" },
    { href: "/leagues/NHL", flag: "🏒", name: "NHL", sub: "북미 아이스하키" },
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
        className="group relative block mb-3 overflow-hidden rounded-2xl border border-amber-300 dark:border-amber-500/30"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600 opacity-90" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4 text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-4xl leading-none drop-shadow" aria-hidden>
              🏆
            </span>
            <div>
              <div className="text-[11px] font-bold tracking-[0.25em] uppercase opacity-80">
                FIFA World Cup 2026 · LIVE SOON
              </div>
              <div className="text-lg sm:text-xl font-black tracking-tight">
                북중미 월드컵 — 6/11 개막
              </div>
              <div className="text-xs sm:text-sm opacity-90 mt-0.5">
                🇰🇷 한국 첫 경기 6/12 11:00 KST vs 체코 · 우승 후보·조별 통과 확률 보러가기
              </div>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2 text-sm font-semibold">
            <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
              예측 / 매치 / 분석
            </span>
            <span aria-hidden className="transition group-hover:translate-x-1">
              →
            </span>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group flex flex-col items-start gap-1 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
          >
            <span className="text-xl leading-none" aria-hidden>
              {t.flag}
            </span>
            <strong className="text-sm font-semibold text-neutral-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
              {t.name}
            </strong>
            <small className="text-[11px] text-neutral-500">{t.sub}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MethodologySection() {
  const items = [
    {
      icon: "📡",
      title: "데이터 출처",
      body: "football-data.org, ESPN 등 공인 스포츠 데이터 소스를 정규화하여 경기 결과·통계·일정을 매일 수집합니다.",
    },
    {
      icon: "📊",
      title: "Elo 레이팅",
      body: "팀별 강도를 정량화하는 Elo 레이팅을 매 경기 갱신해 매치 승률 추정의 기준으로 활용합니다.",
    },
    {
      icon: "🎲",
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5"
          >
            <div className="text-xl mb-2" aria-hidden>
              {it.icon}
            </div>
            <h3 className="text-sm font-semibold mb-2">{it.title}</h3>
            <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              {it.body}
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
            className="group rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 open:border-neutral-300 dark:open:border-neutral-700 transition"
          >
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-semibold text-sm">
              <span>{f.q}</span>
              <span
                className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-lg leading-none text-neutral-400 group-open:rotate-45 transition-transform duration-200 select-none"
                aria-hidden
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
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

