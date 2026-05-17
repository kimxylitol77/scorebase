import { prisma } from "@/lib/db";
import Image from "next/image";
import Markdown from "@/components/Markdown";
import InningScoreChart from "@/components/InningScoreChart";
import type { InningProb } from "@/lib/predict/baseball-poisson";
import LeagueBadge from "@/components/LeagueBadge";
import MatchInsight from "@/components/MatchInsight";
import InjuryAndKeyPlayers from "@/components/InjuryAndKeyPlayers";
import RelatedArticles from "@/components/RelatedArticles";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatDateKo } from "@/lib/format";
import { getExternalLinks } from "@/lib/external-links";
import AdminEditLink from "@/components/AdminEditLink";
import { SITE_URL } from "@/lib/site-url";
import { toKoreanTeamName } from "@/lib/team-names";

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

const SITE_NAME = process.env.SITE_NAME ?? "Scorebase";

/**
 * 본문 마크다운에서 검색·소셜 미리보기용 description 생성.
 *
 * SportsEvent JSON-LD 의 description 권장 길이는 200~500자 (Google Rich Results
 * 가이드). 너무 짧으면 검증 reject 가능. NewsArticle 의 메타 description 도
 * 같이 쓰므로 280자 정도가 SERP·SNS 미리보기·Rich Results 모두 만족.
 *
 * 마지막 한 글자 단위 cut 이 단어 잘림을 만드는 경우가 있어 문장 부호 직후로 한정.
 */
function makeDescription(content: string): string {
  const flat = content
    .replace(/[#*_`>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= 280) return flat;
  // 280자 이내에서 마지막 문장 종결 부호 우선 cut
  const slice = flat.slice(0, 280);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("다. "),
    slice.lastIndexOf("다."),
  );
  if (lastSentenceEnd >= 200) return slice.slice(0, lastSentenceEnd + 1);
  // 종결 부호 없으면 띄어쓰기에서 cut
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace >= 200 ? slice.slice(0, lastSpace) + "…" : slice + "…";
}

/** 본문에서 "ID(Eng, 한글)" 패턴의 선수 ID·본명 추출. 최대 maxPick개. */
function extractLolPlayerMentions(
  content: string,
  maxPick = 6,
): Array<{ id: string; nameKo?: string }> {
  // 패턴: "페이커(Faker, 이상혁)" 또는 "Faker(Lee Sang-hyeok, 이상혁)" 또는 "Zeus(최우제)"
  // 첫 등장만 잡으면 충분.
  const re = /([A-Za-z][A-Za-z0-9.]{1,20})\s*\(([^)]+)\)/g;
  const seen = new Map<string, string | undefined>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    const inner = m[2];
    // 한글 본명 추출
    const koMatch = inner.match(/([가-힣]{2,4})/);
    if (!seen.has(id)) {
      seen.set(id, koMatch ? koMatch[1] : undefined);
      if (seen.size >= maxPick) break;
    }
  }
  return [...seen.entries()].map(([id, nameKo]) => ({ id, nameKo }));
}

/** 본문에서 패치 버전(16.9.1 류 X.Y.Z) 추출. 첫 매치만. */
function extractLolPatch(content: string): string | undefined {
  const m = content.match(/\b(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\b/);
  return m ? m[1] : undefined;
}

const LCK_LEAGUES = new Set(["LOL", "LCK"]);

interface LolMetaInput {
  homeName: string;
  awayName: string;
  startTime: Date;
  content: string;
  type: "PREVIEW" | "RECAP" | "ANALYSIS";
  homeScore: number | null;
  awayScore: number | null;
  /** URL slug — type 외 추가 분기 단서 (lol-recap-* / lol-preview-*) */
  slug: string;
}

function buildLolMetadata(opts: LolMetaInput): { description: string; keywords: string[] } {
  const { homeName, awayName, startTime, content, type, homeScore, awayScore, slug } = opts;
  const patch = extractLolPatch(content);
  const players = extractLolPlayerMentions(content);
  const dateStr = startTime.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });

  // type + slug 둘 중 어느 하나라도 RECAP 신호면 RECAP 분기.
  // (DB type 누락 케이스 + 캐시 안전 둘 다 대응)
  const isRecap = type === "RECAP" || slug.startsWith("lol-recap");

  if (isRecap) {
    // RECAP — 끝난 매치 리뷰
    const scoreStr =
      homeScore != null && awayScore != null
        ? `${homeScore}-${awayScore}`
        : "결과";
    const description = `${homeName} ${scoreStr} ${awayName} — ${dateStr} LCK 매치 리뷰. 게임별 MVP, 결정적 순간 타임라인, 시즌 함의 분석. 스코어베이스.`;
    const keywords = [
      "LCK 리뷰",
      "LCK 결과",
      "LCK 매치 리뷰",
      `${homeName} vs ${awayName}`,
      `${homeName} 경기 결과`,
      `${awayName} 경기 결과`,
      "LCK MVP",
      "롤 매치 분석",
      "LoL 결과",
      ...players.flatMap((p) => [p.id, ...(p.nameKo ? [p.nameKo] : [])]),
      "스코어베이스",
      "Scorebase",
    ];
    return { description, keywords };
  }

  // PREVIEW (default)
  const patchPart = patch ? `${patch} 패치 메타 분석, ` : "";
  const description = `${homeName} vs ${awayName} — ${dateStr} LCK 매치 프리뷰. ${patchPart}5라인 매치업, 모델 승률 추정. 스코어베이스.`;
  const keywords = [
    "LCK",
    "LCK 일정",
    "LCK 예측",
    `${homeName} vs ${awayName}`,
    homeName,
    awayName,
    "롤",
    "리그 오브 레전드",
    "롤 e스포츠 분석",
    "롤드컵",
    "LCK 프리뷰",
    "LCK 매치업",
    ...players.flatMap((p) => [p.id, ...(p.nameKo ? [p.nameKo] : [])]),
  ];
  return { description, keywords };
}

// 종목별 평균 매치 시간 (분) — endDate 추정용
const MATCH_DURATION_MIN: Record<string, number> = {
  EPL: 110, LALIGA: 110, BUNDESLIGA: 110, SERIE_A: 110,
  LIGUE_1: 110, MLS: 110, UCL: 110, WORLD_CUP: 120,
  NBA: 150, NHL: 150,
  MLB: 180, KBO: 200, NPB: 200,
  LOL: 180, // BO3 시리즈 평균 약 3시간 (Bo5는 더 길지만 정규시즌은 Bo3)
};

// 리그별 홈 국가/지역 + 대표 도시 — Place location 보강용.
// Google Rich Results 의 SportsEvent 검증이 location.address 의 addressLocality 를
// 도시명으로 기대하기 때문에, raw 에 venue.city 가 없으면 리그 대표 도시 사용.
const LEAGUE_COUNTRY: Record<
  string,
  { name: string; code: string; defaultCity: string }
> = {
  EPL:        { name: "England",      code: "GB", defaultCity: "London" },
  LALIGA:     { name: "Spain",        code: "ES", defaultCity: "Madrid" },
  BUNDESLIGA: { name: "Germany",      code: "DE", defaultCity: "Berlin" },
  SERIE_A:    { name: "Italy",        code: "IT", defaultCity: "Rome" },
  LIGUE_1:    { name: "France",       code: "FR", defaultCity: "Paris" },
  MLS:        { name: "United States", code: "US", defaultCity: "New York" },
  UCL:        { name: "Europe",       code: "EU", defaultCity: "London" },
  WORLD_CUP:  { name: "USA / Canada / Mexico", code: "US", defaultCity: "New York" },
  NBA:        { name: "United States", code: "US", defaultCity: "New York" },
  NHL:        { name: "United States", code: "US", defaultCity: "New York" },
  MLB:        { name: "United States", code: "US", defaultCity: "New York" },
  KBO:        { name: "South Korea",  code: "KR", defaultCity: "Seoul" },
  NPB:        { name: "Japan",        code: "JP", defaultCity: "Tokyo" },
  LOL:        { name: "South Korea",  code: "KR", defaultCity: "Seoul" },
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
      name: venueName ?? `${home} Home Stadium`,
      address: {
        "@type": "PostalAddress",
        streetAddress: venueName ?? `${home} Home Stadium`,
        addressLocality: venueCity ?? country?.defaultCity ?? "Unknown",
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
      url: `${siteUrl}/leagues/${league}`,
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
    select: {
      title: true,
      content: true,
      league: true,
      type: true,
      publishedAt: true,
      match: {
        select: {
          startTime: true,
          homeScore: true,
          awayScore: true,
          homeStarter: true,
          awayStarter: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (!article) return { title: "기사를 찾을 수 없습니다" };

  const url = `${SITE_URL}/articles/${slug}`;
  const isLol = LCK_LEAGUES.has(article.league);
  const isBaseball =
    article.league === "KBO" ||
    article.league === "MLB" ||
    article.league === "NPB";

  // LoL 분기 — keywords 풍부화 + description 명시 패턴 (PREVIEW vs RECAP)
  let desc: string;
  let keywords: string[] | undefined;
  if (isLol && article.match) {
    const lolMeta = buildLolMetadata({
      homeName: toKoreanTeamName(article.match.homeTeam.name),
      awayName: toKoreanTeamName(article.match.awayTeam.name),
      startTime: article.match.startTime,
      content: article.content,
      type: article.type as "PREVIEW" | "RECAP" | "ANALYSIS",
      homeScore: article.match.homeScore,
      awayScore: article.match.awayScore,
      slug,
    });
    desc = lolMeta.description;
    keywords = lolMeta.keywords;
  } else if (isBaseball && article.match) {
    // 야구 KBO/MLB/NPB — recap/preview 분기 + starter 이름 키워드
    desc = makeDescription(article.content);
    const homeName = toKoreanTeamName(article.match.homeTeam.name);
    const awayName = toKoreanTeamName(article.match.awayTeam.name);
    const isKbo = article.league === "KBO";
    const isMlb = article.league === "MLB";
    const isRecap = slug.includes("-recap-");
    const baseKeywords = isRecap
      ? [
          `${homeName} vs ${awayName}`,
          `${homeName} 경기 결과`,
          `${awayName} 경기 결과`,
          `${article.league} 리뷰`,
          `${article.league} 결과`,
          isKbo ? "프로야구 결과" : isMlb ? "MLB 결과" : "NPB 결과",
        ]
      : [
          `${homeName} vs ${awayName} 예측`,
          `${homeName} 선발 투수`,
          `${awayName} 선발 투수`,
          `${article.league} 프리뷰`,
          `${article.league} 예측`,
          isKbo ? "오늘 프로야구" : isMlb ? "오늘 MLB" : "오늘 NPB",
        ];
    const starterNames: string[] = [];
    for (const raw of [article.match.homeStarter, article.match.awayStarter]) {
      if (!raw) continue;
      try {
        const j = JSON.parse(raw) as { name?: string };
        if (j.name) starterNames.push(`${j.name} 등판`);
      } catch {}
    }
    keywords = [
      ...baseKeywords,
      ...starterNames,
      "야구 분석",
      "스코어베이스",
      "Scorebase",
    ];
  } else {
    desc = makeDescription(article.content);
  }

  return {
    title: article.title,
    description: desc,
    ...(keywords ? { keywords } : {}),
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

  // LoL RECAP — 본문 안에 5라인 매치업·시즌·MVP 가 모두 들어있는 긴 Markdown 사용.
  // lolContext 는 디버깅용으로 DB 에 저장만 하고 페이지에서 카드로 렌더링하지 않는다.

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

      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/leagues/${article.league}`}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← {article.league}
        </Link>
        <AdminEditLink articleId={article.id} />
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
                {toKoreanTeamName(article.match.homeTeam.name)}
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
                {toKoreanTeamName(article.match.awayTeam.name)}
              </div>
              <div className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 font-medium">
                ✈ 원정
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* LoL RECAP 본문은 길게 풀어쓴 Markdown (사용자 선호 — 카드 UI 대신 본문에 모든 정보 통합).
          lolRecapCtx 가 있어도 본문 안에 5라인 매치업·시즌·MVP 가 다 들어있으므로 Markdown 만. */}
      <Markdown>{article.content}</Markdown>

      {/* AI 작성 disclosure + 데이터 출처 */}
      <AiDisclosure league={article.league} type={article.type} />

      {/* 참고 외부 출처 (공식 사이트·통계) */}
      <ExternalSources league={article.league} />

      {article.match && <MatchInsight match={article.match} />}

      {/* 야구(KBO/MLB/NPB) — Poisson 이닝별 득점 확률 차트.
          generate-articles / generate-previews 가 baseballContext JSON 저장. */}
      {article.baseballContext && article.match && (() => {
        try {
          const bc = JSON.parse(article.baseballContext) as {
            inningScoreProbs?: InningProb[];
            totalExpectedRuns?: { team1: number; team2: number };
            winProbPoisson?: { team1: number; team2: number };
          };
          if (!bc.inningScoreProbs || !bc.totalExpectedRuns) return null;
          return (
            <InningScoreChart
              inningProbs={bc.inningScoreProbs}
              awayName={toKoreanTeamName(article.match!.awayTeam.name)}
              homeName={toKoreanTeamName(article.match!.homeTeam.name)}
              totalExpectedRuns={bc.totalExpectedRuns}
              winProb={bc.winProbPoisson}
            />
          );
        } catch {
          return null;
        }
      })()}

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
    // Liquipedia (LCK 로고) 는 hotlink 차단으로 plain <img> 안 됨 →
    // Next.js image optimizer 통과. 다른 CDN 은 hotlink 허용이라 그대로.
    if (src.includes("liquipedia.net")) {
      return (
        <Image
          src={src}
          alt={`${name} 로고`}
          width={64}
          height={64}
          className="w-14 h-14 sm:w-16 sm:h-16 object-contain bg-white rounded-md p-1.5 shadow-sm"
        />
      );
    }
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
  NPB:        ["api-sports baseball Pro"],
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

/* =====================================================================
 * 외부 참고 출처 — 권위 있는 공식 사이트·통계 사이트 링크
 * rel="nofollow noopener" 로 PageRank 손실 방지 + 보안.
 * ===================================================================*/
function ExternalSources({ league }: { league: string }) {
  const links = getExternalLinks(league);
  if (links.length === 0) return null;

  return (
    <aside className="mt-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-5 py-4 text-xs">
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5">🔗</span>
        <div className="flex-1">
          <div className="text-neutral-500 dark:text-neutral-400 font-medium mb-1.5">
            참고 출처
          </div>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.url} className="flex items-center gap-2 leading-relaxed">
                <span className="text-neutral-400">·</span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {l.label}
                </span>
                <span className="text-neutral-300 dark:text-neutral-700">—</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  {l.display}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                    className="opacity-60"
                  >
                    <path
                      d="M3 9L9 3M9 3H4.5M9 3V7.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
