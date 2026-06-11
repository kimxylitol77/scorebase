// 종목별 PREVIEW 글 모음 페이지.
// 축구·야구·농구·하키·e스포츠 카테고리 탭으로 프리뷰만 모아 보기.
//
// 야구는 리그별 발행 주기가 달라(MLB 미래 3일치 / KBO·NPB 당일분) 한 그리드에 섞으면
// MLB 미래 경기가 화면을 점유해 KBO/NPB 가 묻힘 → 야구 탭은 KBO·MLB·NPB 하위 탭으로
// 두고 한 번에 한 리그만 선택해서 보게 함. (그 외 종목은 카테고리 통합 그리드)

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import { leagueLabel } from "@/lib/analysis/matches";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface SportCategory {
  key: "ALL" | "SOCCER" | "BASEBALL" | "BASKETBALL" | "HOCKEY" | "ESPORTS";
  label: string;
  leagues: string[]; // 빈 배열 = 전체
}

const SPORTS: SportCategory[] = [
  { key: "ALL", label: "전체", leagues: [] },
  {
    key: "SOCCER",
    label: "축구",
    leagues: [
      "EPL",
      "LALIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
      "MLS",
      "UCL",
      "WORLD_CUP",
      "INTL_FRIENDLY",
    ],
  },
  { key: "BASEBALL", label: "야구", leagues: ["KBO", "NPB", "MLB"] },
  { key: "BASKETBALL", label: "농구", leagues: ["NBA"] },
  { key: "HOCKEY", label: "하키", leagues: ["NHL"] },
  { key: "ESPORTS", label: "e스포츠", leagues: ["LOL"] },
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
    },
  },
} satisfies Prisma.ArticleInclude;

const ARTICLE_ORDER: Prisma.ArticleOrderByWithRelationInput[] = [
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
  const titleSuffix = sport.key === "ALL" ? "" : ` · ${sport.label}${bleague}`;
  return {
    title: `프리뷰${titleSuffix} — 스코어베이스`,
    description: `축구·야구·농구·하키·e스포츠 프리뷰를 한 곳에서. ${sport.label}${bleague} 카테고리의 최신 프리뷰 글 모음.`,
    // sport 탭까지만 canonical 변형 — 야구 하위 리그 탭은 sport 페이지로 정규화
    alternates: {
      canonical: sport.key === "ALL" ? "/previews" : `/previews?sport=${sport.key}`,
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

  const [articles, total, countsBySport, baseballCounts] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: ARTICLE_ORDER,
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where }),
    Promise.all(
      SPORTS.map(async (s) => ({
        key: s.key,
        count: await prisma.article.count({ where: buildWhere(s.leagues) }),
      })),
    ),
    isBaseball
      ? Promise.all(
          BASEBALL_TABS.map(async (lg) => ({
            league: lg,
            count: await prisma.article.count({ where: buildWhere([lg]) }),
          })),
        )
      : Promise.resolve([] as { league: string; count: number }[]),
  ]);

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

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
          PREVIEW {current.key !== "ALL" ? `· ${current.label}` : ""}
        </div>
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
                className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition sm:px-4 ${
                  active
                    ? "border-zinc-900 text-zinc-950 dark:border-white dark:text-white"
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
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/[0.1]"
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
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-black/5 transition hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                  >
                    ← 이전
                  </Link>
                )}
                <span className="px-4 py-2 text-sm tabular-nums text-zinc-500 dark:text-white/45">
                  {pageNum} / {totalPages}
                </span>
                {pageNum < totalPages && (
                  <Link
                    href={pageHref(pageNum + 1)}
                    className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-black/5 transition hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.08]"
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
            EPL, MLB, NBA, KBO 등 주요 리그의 경기 시작 전 매치업 분석·예상 라인업·Elo 레이팅·H2H 상대 전적을 데이터 기반으로 정리한 프리뷰 콘텐츠입니다.
          </p>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
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
