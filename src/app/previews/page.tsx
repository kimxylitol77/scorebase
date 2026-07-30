// 종목별 PREVIEW 글 모음 페이지.
// 축구·야구·농구·하키·e스포츠 카테고리 탭으로 프리뷰만 모아 보기.
//
// 야구는 리그별 발행 주기가 달라(MLB 미래 3일치 / KBO·NPB 당일분) 한 그리드에 섞으면
// MLB 미래 경기가 화면을 점유해 KBO/NPB 가 묻힘 → 야구 탭은 KBO·MLB·NPB 하위 탭으로
// 두고 한 번에 한 리그만 선택해서 보게 함. (그 외 종목은 카테고리 통합 그리드)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import AmbientGlow from "@/components/AmbientGlow";
import { leagueLabel } from "@/lib/analysis/matches";
import { SPORTS as SPORT_META } from "@/lib/sports/sport-leagues";
import { SITE_URL } from "@/lib/site-url";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";

interface SportCategory {
  key: "ALL" | "SOCCER" | "BASEBALL" | "BASKETBALL" | "HOCKEY" | "ESPORTS";
  label: string;
  leagues: string[]; // 빈 배열 = 전체
}

// 리그 목록은 sport-leagues.ts 단일 진실에서 가져온다. 자체 하드코딩하면
// 신규 리그가 종목 탭에서 누락된다 (2026-07-17: K리그·J리그·WNBA·LMB 등 88건이
// "전체" 탭에만 있고 종목 탭 어디에도 안 잡히던 버그).
const leaguesOf = (code: string) =>
  SPORT_META.find((s) => s.code === code)?.leagues ?? [];

const SPORTS: SportCategory[] = [
  { key: "ALL", label: "전체", leagues: [] },
  { key: "SOCCER", label: "축구", leagues: leaguesOf("soccer") },
  { key: "BASEBALL", label: "야구", leagues: leaguesOf("baseball") },
  { key: "BASKETBALL", label: "농구", leagues: leaguesOf("basketball") },
  { key: "HOCKEY", label: "하키", leagues: leaguesOf("hockey") },
  { key: "ESPORTS", label: "e스포츠", leagues: leaguesOf("esports") },
];

// 탭별 SEO 문구 — 검색 의도("EPL 프리뷰", "KBO 선발 분석")에 맞춘 title·description.
// 대표 리그명은 카피용 나열이라 하드코딩하되, 글 수 같은 통계 숫자는 아래 본문에서
// DB 카운트만 사용한다(마케팅 숫자 하드코딩 금지 원칙).
const SPORT_SEO: Record<
  SportCategory["key"],
  { title: string; description: string }
> = {
  ALL: {
    title: "경기 프리뷰 — 오늘의 매치 분석·예상 라인업",
    description:
      "EPL·라리가·챔피언스리그·K리그부터 KBO·MLB·NPB, NBA·NHL·LCK까지 경기 전 데이터 프리뷰. Elo 전력 비교, 최근 폼, 상대 전적, 선발 투수 매치업을 경기 시작 전에 확인하세요.",
  },
  SOCCER: {
    title: "축구 프리뷰 — 경기 전 분석·예상 라인업",
    description:
      "EPL·라리가·분데스리가·세리에A·리그1·K리그·챔피언스리그 축구 경기 프리뷰. Elo 레이팅 전력 비교와 최근 폼, 홈·원정 성적, 상대 전적 기반의 경기 전 분석.",
  },
  BASEBALL: {
    title: "야구 프리뷰 — KBO·MLB·NPB 선발 매치업 분석",
    description:
      "KBO·MLB·NPB 야구 경기 프리뷰. 선발 투수 매치업과 ERA 비교, 팀 타격 폼, 상대 전적 기반 경기 전 분석. 선발 확정·변경은 카드 배지로 표시됩니다.",
  },
  BASKETBALL: {
    title: "농구 프리뷰 — NBA 경기 전 분석",
    description:
      "NBA·WNBA 농구 경기 프리뷰. 팀 전력 비교, 최근 폼, 상대 전적을 데이터 기반으로 정리한 경기 전 분석.",
  },
  HOCKEY: {
    title: "하키 프리뷰 — NHL 경기 전 분석",
    description:
      "NHL 하키 경기 프리뷰. 팀 전력 비교, 최근 폼, 상대 전적을 데이터 기반으로 정리한 경기 전 분석.",
  },
  ESPORTS: {
    title: "e스포츠 프리뷰 — LCK·LoL 경기 전 분석",
    description:
      "LCK 등 LoL e스포츠 경기 프리뷰. 팀 전력과 최근 경기력, 상대 전적을 데이터 기반으로 정리한 경기 전 분석.",
  },
};

// 하단 FAQ — 화면 노출 + FAQPage JSON-LD 동일 소스. 답변은 실제 동작만 서술
// (발행 주기·선발 배지·종료 스코어는 코드로 검증된 사실. 과장 광고 문구 금지).
const FAQ = [
  {
    q: "경기 프리뷰는 언제 발행되나요?",
    a: "경기 시작 전에 자동 발행됩니다. 야구는 KBO·NPB 당일, MLB는 최대 3일 전에 발행되며, 선발 투수가 확정되거나 변경되면 카드에 배지로 표시됩니다.",
  },
  {
    q: "프리뷰에는 어떤 내용이 담기나요?",
    a: "Elo 레이팅 기반 팀 전력 비교, 최근 폼, 홈·원정 성적, 상대 전적(H2H)을 데이터 기반으로 정리합니다. 야구는 선발 투수 매치업과 ERA 비교가 핵심이고, 축구는 예상 라인업과 부상자 정보를 함께 다룹니다.",
  },
  {
    q: "종료된 경기의 프리뷰도 볼 수 있나요?",
    a: "네. 종료된 경기의 프리뷰는 카드에 최종 스코어와 종료 표시가 붙은 채 그대로 남습니다. 경기 전 전망과 실제 결과를 비교해 볼 수 있습니다.",
  },
  {
    q: "프리뷰와 리뷰는 무엇이 다른가요?",
    a: "프리뷰는 경기 시작 전의 전망·분석이고, 리뷰는 경기 종료 후의 결과·기록 정리입니다. 진행 중인 경기는 라이브스코어에서 실시간으로 확인할 수 있습니다.",
  },
];

const PAGE_SIZE = 24;

// 야구 하위 탭(리그) — 한국 사이트라 KBO 를 기본/첫 탭으로.
const BASEBALL_TABS = ["KBO", "MLB", "NPB"];

const ARTICLE_INCLUDE = {
  match: {
    select: {
      startersUpdatedAt: true,
      homeStarter: true,
      awayStarter: true,
      startTime: true,
      // 카드 매치업 줄(로고+팀명)·예정/종료 구분(킥오프 칩+스코어)용
      status: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  },
} satisfies Prisma.ArticleInclude;

// 예정 경기는 킥오프 임박순(asc) — "오늘 뭐 하지"가 프리뷰를 보는 이유라
// 가장 먼 미래가 최상단에 오면 안 된다. 종료된 경기는 최신순(desc) 으로 뒤에 붙인다.
const UPCOMING_ORDER: Prisma.ArticleOrderByWithRelationInput[] = [
  { match: { startTime: "asc" } },
  { publishedAt: "desc" },
];
const PAST_ORDER: Prisma.ArticleOrderByWithRelationInput[] = [
  { match: { startTime: "desc" } },
  { publishedAt: "desc" },
];

interface Props {
  searchParams: Promise<{ sport?: string; league?: string; page?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const sport =
    SPORTS.find((s) => s.key === (sp.sport ?? "ALL").toUpperCase()) ?? SPORTS[0];
  const bleague =
    sport.key === "BASEBALL" &&
    BASEBALL_TABS.includes((sp.league ?? "").toUpperCase())
      ? ` ${(sp.league as string).toUpperCase()}`
      : "";
  const seo = SPORT_SEO[sport.key];
  return {
    title: bleague ? `${bleague.trim()} 프리뷰 — 선발 매치업 분석` : seo.title,
    description: seo.description,
    // 야구 하위 리그 탭은 리그 전용 경로(/previews/NPB)가 정본 — 같은 목록을 쿼리스트링과
    // 경로 두 벌로 색인시키지 않는다. 그 외는 sport 탭까지만 canonical 변형.
    alternates: {
      canonical: bleague
        ? `/previews/${bleague.trim()}`
        : sport.key === "ALL"
          ? "/previews"
          : `/previews?sport=${sport.key}`,
    },
  };
}

export default async function PreviewsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sportKey = (sp.sport ?? "ALL").toUpperCase();
  const current = SPORTS.find((s) => s.key === sportKey);
  if (!current) notFound();

  const isBaseball = sportKey === "BASEBALL";
  // 야구는 하위 탭에서 선택한 단일 리그만 표시 (없거나 잘못된 값이면 첫 탭 KBO)
  const selectedBaseball = isBaseball
    ? BASEBALL_TABS.includes((sp.league ?? "").toUpperCase())
      ? (sp.league as string).toUpperCase()
      : BASEBALL_TABS[0]
    : null;

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const buildWhere = (leagues: string[]): Prisma.ArticleWhereInput => ({
    status: "PUBLISHED",
    type: "PREVIEW",
    // 경기 삭제로 연결 끊긴 orphan 글 제외 — match.startTime 이 null 이면
    // orderBy startTime desc 에서 맨 앞으로 와 지난 글이 최상단에 박힘 (2026-06-05 NBA #1717).
    matchId: { not: null },
    ...(leagues.length > 0 ? { league: { in: leagues } } : {}),
  });

  // 야구면 선택된 단일 리그, 그 외엔 카테고리 리그 전체
  const where = buildWhere(
    isBaseball ? [selectedBaseball as string] : current.leagues,
  );

  const now = new Date();
  const upcomingWhere: Prisma.ArticleWhereInput = {
    ...where,
    match: { startTime: { gte: now } },
  };
  const pastWhere: Prisma.ArticleWhereInput = {
    ...where,
    match: { startTime: { lt: now } },
  };
  const offset = (pageNum - 1) * PAGE_SIZE;

  // 탭 카운트는 리그별 groupBy 1회로 뽑아 JS 에서 종목별 합산 — 종목 6개 + 야구
  // 하위 탭 3개를 count 쿼리 9개로 따로 세던 것을 축소 (force-dynamic 페이지라 매 요청 부하).
  const [upcomingTotal, pastTotal, leagueCounts] = await Promise.all([
    prisma.article.count({ where: upcomingWhere }),
    prisma.article.count({ where: pastWhere }),
    prisma.article.groupBy({
      by: ["league"],
      where: { status: "PUBLISHED", type: "PREVIEW", matchId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const leagueCountMap = new Map(
    leagueCounts.map((r) => [r.league, r._count._all]),
  );
  const countOf = (leagues: string[]) =>
    leagues.length === 0
      ? [...leagueCountMap.values()].reduce((a, b) => a + b, 0)
      : leagues.reduce((s, lg) => s + (leagueCountMap.get(lg) ?? 0), 0);
  const countsBySport = SPORTS.map((s) => ({
    key: s.key,
    count: countOf(s.leagues),
  }));
  const baseballCounts = isBaseball
    ? BASEBALL_TABS.map((lg) => ({ league: lg, count: countOf([lg]) }))
    : [];

  const total = upcomingTotal + pastTotal;

  // 예정분을 먼저 채우고 남는 자리를 종료분으로 메운다 — 페이지 경계에서 두
  // 그룹이 한 화면에 섞일 수 있으나 순서(예정 → 종료)는 전 페이지에 걸쳐 유지된다.
  const upcomingTake = Math.max(
    0,
    Math.min(PAGE_SIZE, upcomingTotal - offset),
  );
  const [upcoming, past] = await Promise.all([
    upcomingTake > 0
      ? prisma.article.findMany({
          where: upcomingWhere,
          orderBy: UPCOMING_ORDER,
          skip: Math.min(offset, upcomingTotal),
          take: upcomingTake,
          include: ARTICLE_INCLUDE,
        })
      : Promise.resolve([]),
    PAGE_SIZE - upcomingTake > 0
      ? prisma.article.findMany({
          where: pastWhere,
          orderBy: PAST_ORDER,
          skip: Math.max(0, offset - upcomingTotal),
          take: PAGE_SIZE - upcomingTake,
          include: ARTICLE_INCLUDE,
        })
      : Promise.resolve([]),
  ]);
  const articles = [...upcoming, ...past];

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countMap = new Map(countsBySport.map((c) => [c.key, c.count]));

  // 페이지네이션 링크 — sport·league·page 보존
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (current.key !== "ALL") params.set("sport", current.key);
    if (isBaseball && selectedBaseball) params.set("league", selectedBaseball);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/previews?${qs}` : "/previews";
  };

  // 숫자 페이지 링크 — 처음·현재±1·끝 + 생략(…). 이전/다음만 있으면 깊은 페이지는
  // 사용자도 크롤러도 링크를 수십 번 타야 도달한다.
  const pageItems: (number | "…")[] = [];
  if (totalPages > 1) {
    const wanted = [1, pageNum - 1, pageNum, pageNum + 1, totalPages]
      .filter((p) => p >= 1 && p <= totalPages)
      .filter((p, i, arr) => arr.indexOf(p) === i)
      .sort((a, b) => a - b);
    let prev = 0;
    for (const p of wanted) {
      if (prev && p - prev > 1) pageItems.push("…");
      pageItems.push(p);
      prev = p;
    }
  }

  // JSON-LD — Breadcrumb + CollectionPage + FAQPage (FAQ 는 하단 화면 노출과 동일 소스)
  const seo = SPORT_SEO[current.key];
  const canonicalUrl =
    current.key === "ALL"
      ? `${SITE_URL}/previews`
      : `${SITE_URL}/previews?sport=${current.key}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        ...(current.key === "ALL"
          ? [{ "@type": "ListItem", position: 2, name: "프리뷰" }]
          : [
              {
                "@type": "ListItem",
                position: 2,
                name: "프리뷰",
                item: `${SITE_URL}/previews`,
              },
              {
                "@type": "ListItem",
                position: 3,
                name: `${current.label} 프리뷰`,
              },
            ]),
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: seo.title,
      url: canonicalUrl,
      description: seo.description,
      inLanguage: "ko",
      publisher: {
        "@type": "Organization",
        name: "스코어베이스",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <div className="relative">
      <AmbientGlow />
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(schema) }}
        />
      ))}

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> PREVIEW {current.key !== "ALL" ? `· ${current.label}` : ""}
        </span>
        <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.04em] leading-[1.05] text-zinc-950 dark:text-white">
          프리뷰 모음
        </h1>
        <p className="mt-4 max-w-xl text-base sm:text-lg text-zinc-600 dark:text-white/55">
          축구 · 야구 · 농구 · 하키 · e스포츠 — 예정된 매치의 사전 분석·전망을
          한 곳에서.
        </p>
      </section>

      {/* 종목 탭 */}
      <div className="sticky top-16 z-10 border-b border-black/5 bg-white/85 backdrop-blur dark:border-white/10 dark:bg-[#0a0a0a]/85">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-1 gap-y-0 px-4 sm:flex-nowrap sm:gap-x-2 sm:overflow-x-auto sm:px-6">
          {SPORTS.map((s) => {
            const active = s.key === current.key;
            const count = countMap.get(s.key) ?? 0;
            const href = s.key === "ALL" ? "/previews" : `/previews?sport=${s.key}`;
            return (
              <Link
                key={s.key}
                href={href}
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-4 ${
                  active
                    ? "border-rose-500 text-rose-600 dark:text-rose-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                {s.label}
                <span
                  className={`ml-1.5 text-xs tabular-nums ${
                    active
                      ? "text-zinc-500 dark:text-white/55"
                      : "text-zinc-400 dark:text-white/35"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 야구 하위 리그 탭 (KBO · MLB · NPB 선택) */}
      {isBaseball && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-5">
          <div className="flex flex-wrap gap-2">
            {baseballCounts.map(({ league, count }) => {
              const active = league === selectedBaseball;
              return (
                <Link
                  key={league}
                  href={`/previews?sport=BASEBALL&league=${league}`}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    active
                      ? "bg-zinc-900 text-white ring-zinc-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-zinc-900 dark:ring-white"
                      : "bg-white/60 text-zinc-600 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-white/60 dark:ring-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  {leagueLabel(league)}
                  <span
                    className={`ml-1.5 text-xs tabular-nums ${
                      active
                        ? "text-white/60 dark:text-zinc-900/50"
                        : "text-zinc-400 dark:text-white/35"
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 글 목록 */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        {articles.length === 0 ? (
          <div className="rounded-[1.5rem] sm:rounded-[2rem] border border-dashed border-zinc-300 p-12 text-center dark:border-white/15">
            <p className="text-sm text-zinc-500 dark:text-white/50">
              아직 발행된 프리뷰가 없습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>

            {totalPages > 1 && (
              <nav
                aria-label="페이지네이션"
                className="mt-10 flex items-center justify-center gap-1"
              >
                {pageNum > 1 && (
                  <Link
                    href={pageHref(pageNum - 1)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                  >
                    ← 이전
                  </Link>
                )}
                {pageItems.map((item, i) =>
                  item === "…" ? (
                    <span
                      key={`gap-${i}`}
                      className="px-1.5 text-sm text-zinc-400 dark:text-white/30"
                    >
                      …
                    </span>
                  ) : item === pageNum ? (
                    <span
                      key={item}
                      aria-current="page"
                      className="rounded-full bg-zinc-900 px-3.5 py-2 text-sm font-semibold tabular-nums text-white dark:bg-white dark:text-zinc-900"
                    >
                      {item}
                    </span>
                  ) : (
                    <Link
                      key={item}
                      href={pageHref(item)}
                      className="rounded-full px-3.5 py-2 text-sm font-medium tabular-nums text-zinc-500 transition-colors hover:text-zinc-900 dark:text-white/45 dark:hover:text-white"
                    >
                      {item}
                    </Link>
                  ),
                )}
                {pageNum < totalPages && (
                  <Link
                    href={pageHref(pageNum + 1)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                  >
                    다음 →
                  </Link>
                )}
              </nav>
            )}
          </>
        )}

        <section className="mt-10 sm:mt-12 pt-6 sm:pt-8 border-t border-black/5 dark:border-white/10 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            오늘의 경기 프리뷰 및 매치업 분석
          </h2>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
            경기 시작 전 매치업 분석·예상 라인업·Elo 레이팅·상대 전적(H2H)을
            데이터 기반으로 정리한 프리뷰 콘텐츠입니다. 축구는 EPL·라리가·분데스리가·세리에A·리그1·K리그·챔피언스리그,
            야구는 KBO·MLB·NPB, 농구는 NBA, 하키는 NHL, e스포츠는 LCK 를 다루며
            현재까지 총 {(countMap.get("ALL") ?? 0).toLocaleString("ko-KR")}건의
            프리뷰가 발행됐습니다.
          </p>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
            프리뷰는 경기 전에 자동 발행되고, 야구는 선발 투수가 확정·변경되면
            카드에 배지로 표시됩니다. 종료된 경기의 프리뷰는 최종 스코어와 함께
            아카이브로 남아 경기 전 전망과 실제 결과를 비교해 볼 수 있습니다.
          </p>

          <h2 className="pt-3 text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            자주 묻는 질문
          </h2>
          <dl className="space-y-3">
            {FAQ.map((f) => (
              <div key={f.q}>
                <dt className="text-sm font-semibold text-zinc-800 dark:text-white/75">
                  {f.q}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-white/55">
                  {f.a}
                </dd>
              </div>
            ))}
          </dl>

          <p className="pt-3 text-sm leading-relaxed text-zinc-600 dark:text-white/55">
            경기 진행은{" "}
            <Link href="/scores" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              라이브스코어
            </Link>
            에서, 경기 종료 후 결과는{" "}
            <Link href="/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              리뷰
            </Link>
            에서 확인할 수 있습니다. 함께{" "}
            <Link href="/injuries" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              부상자 명단
            </Link>
            과{" "}
            <Link href="/standings" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              리그별 분석
            </Link>
            도 참고하세요.
          </p>
        </section>
      </div>
    </div>
  );
}
