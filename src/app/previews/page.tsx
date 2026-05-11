// 종목별 PREVIEW 글 모음 페이지.
// 사용자 요청: 축구·야구·농구·하키·e스포츠 카테고리 탭으로 프리뷰만 모아 보기.
// 기존 /leagues/[league] 페이지는 그대로 유지.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface SportCategory {
  key: "ALL" | "SOCCER" | "BASEBALL" | "BASKETBALL" | "HOCKEY" | "ESPORTS";
  label: string;
  emoji: string;
  leagues: string[]; // 빈 배열 = 전체
  gradient: string;
}

const SPORTS: SportCategory[] = [
  {
    key: "ALL",
    label: "전체",
    emoji: "🌐",
    leagues: [],
    gradient: "from-blue-500 via-purple-500 to-pink-500",
  },
  {
    key: "SOCCER",
    label: "축구",
    emoji: "⚽",
    leagues: [
      "EPL",
      "LALIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
      "MLS",
      "UCL",
      "WORLD_CUP",
    ],
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
  },
  {
    key: "BASEBALL",
    label: "야구",
    emoji: "⚾",
    leagues: ["KBO", "MLB"],
    gradient: "from-emerald-500 via-green-600 to-teal-700",
  },
  {
    key: "BASKETBALL",
    label: "농구",
    emoji: "🏀",
    leagues: ["NBA"],
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
  },
  {
    key: "HOCKEY",
    label: "하키",
    emoji: "🏒",
    leagues: ["NHL"],
    gradient: "from-cyan-500 via-blue-600 to-indigo-700",
  },
  {
    key: "ESPORTS",
    label: "e스포츠",
    emoji: "🎮",
    leagues: ["LOL"],
    gradient: "from-rose-500 via-fuchsia-600 to-indigo-600",
  },
];

const PAGE_SIZE = 24;

interface Props {
  searchParams: Promise<{ sport?: string; page?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const sp = await searchParams;
  const sport =
    SPORTS.find((s) => s.key === (sp.sport ?? "ALL").toUpperCase()) ?? SPORTS[0];
  const titleSuffix = sport.key === "ALL" ? "" : ` · ${sport.label}`;
  return {
    title: `프리뷰${titleSuffix} — 스코어베이스`,
    description: `축구·야구·농구·하키·e스포츠 프리뷰를 한 곳에서. ${sport.label} 카테고리의 최신 프리뷰 글 모음.`,
  };
}

export default async function PreviewsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sportKey = (sp.sport ?? "ALL").toUpperCase();
  const current = SPORTS.find((s) => s.key === sportKey);
  if (!current) notFound();

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.ArticleWhereInput = {
    status: "PUBLISHED",
    type: "PREVIEW",
    ...(current.leagues.length > 0
      ? { league: { in: current.leagues } }
      : {}),
  };

  const [articles, total, countsBySport] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ match: { startTime: "desc" } }, { publishedAt: "desc" }],
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.article.count({ where }),
    // 각 카테고리 카운트 (탭 옆 숫자)
    Promise.all(
      SPORTS.map(async (s) => {
        const w: Prisma.ArticleWhereInput = {
          status: "PUBLISHED",
          type: "PREVIEW",
          ...(s.leagues.length > 0 ? { league: { in: s.leagues } } : {}),
        };
        return { key: s.key, count: await prisma.article.count({ where: w }) };
      }),
    ),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const countMap = new Map(countsBySport.map((c) => [c.key, c.count]));

  return (
    <div>
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${current.gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-14">
          <div
            className={`inline-block bg-gradient-to-br ${current.gradient} bg-clip-text text-transparent text-xs font-bold tracking-[0.2em] uppercase mb-2`}
          >
            PREVIEW {current.key !== "ALL" ? `· ${current.label}` : ""}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            프리뷰 모음
          </h1>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-xl">
            축구 · 야구 · 농구 · 하키 · e스포츠 — 예정된 매치의 사전 분석·전망을
            한 곳에서.
          </p>
        </div>
      </section>

      {/* 종목 탭 */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 sticky top-16 bg-white/85 dark:bg-neutral-950/85 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-x-1 sm:gap-x-2 gap-y-0 flex-wrap sm:flex-nowrap sm:overflow-x-auto">
          {SPORTS.map((s) => {
            const active = s.key === current.key;
            const count = countMap.get(s.key) ?? 0;
            const href = s.key === "ALL" ? "/previews" : `/previews?sport=${s.key}`;
            return (
              <Link
                key={s.key}
                href={href}
                className={`px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  active
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <span className="mr-1.5" aria-hidden>
                  {s.emoji}
                </span>
                {s.label}
                <span
                  className={`ml-1.5 text-xs tabular-nums ${
                    active
                      ? "text-neutral-500"
                      : "text-neutral-400 dark:text-neutral-600"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 글 목록 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {articles.length === 0 ? (
          <p className="text-neutral-500 py-12 text-center">
            아직 발행된 프리뷰가 없습니다.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <nav
                aria-label="페이지네이션"
                className="mt-10 flex items-center justify-center gap-1"
              >
                {pageNum > 1 && (
                  <Link
                    href={
                      current.key === "ALL"
                        ? `/previews?page=${pageNum - 1}`
                        : `/previews?sport=${current.key}&page=${pageNum - 1}`
                    }
                    className="px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    ← 이전
                  </Link>
                )}
                <span className="px-4 py-2 text-sm text-neutral-500">
                  {pageNum} / {totalPages}
                </span>
                {pageNum < totalPages && (
                  <Link
                    href={
                      current.key === "ALL"
                        ? `/previews?page=${pageNum + 1}`
                        : `/previews?sport=${current.key}&page=${pageNum + 1}`
                    }
                    className="px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    다음 →
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
