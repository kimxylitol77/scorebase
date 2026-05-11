import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const VALID_LEAGUES = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "NBA",
  "NHL",
  "MLB",
  "KBO",
] as const;
type ValidLeague = (typeof VALID_LEAGUES)[number];

type ArticleType = "PREVIEW" | "RECAP" | "ANALYSIS";
type FilterType = "ALL" | ArticleType;

const VALID_TYPES: FilterType[] = ["ALL", "PREVIEW", "RECAP", "ANALYSIS"];

const LEAGUE_INFO: Record<
  ValidLeague,
  { name: string; subtitle: string; gradient: string; copy: string }
> = {
  EPL: {
    name: "프리미어리그",
    subtitle: "English Premier League",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    copy: "잉글리시 프리미어리그의 매치 결과와 분석.",
  },
  NBA: {
    name: "NBA",
    subtitle: "National Basketball Association",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    copy: "미국 프로농구 NBA 의 경기 결과와 분석.",
  },
  NHL: {
    name: "NHL",
    subtitle: "National Hockey League",
    gradient: "from-cyan-500 via-blue-600 to-indigo-700",
    copy: "북미 프로 아이스하키 NHL 의 경기 결과와 분석.",
  },
  MLB: {
    name: "MLB",
    subtitle: "Major League Baseball",
    gradient: "from-emerald-500 via-green-600 to-teal-700",
    copy: "메이저리그 야구의 경기 결과와 분석. 한국 선수 활약상 포함.",
  },
  LALIGA: {
    name: "라리가",
    subtitle: "La Liga (스페인)",
    gradient: "from-amber-500 via-red-600 to-yellow-500",
    copy: "스페인 프리메라리가의 매치 결과와 분석.",
  },
  BUNDESLIGA: {
    name: "분데스리가",
    subtitle: "Bundesliga (독일)",
    gradient: "from-yellow-400 via-red-600 to-slate-900",
    copy: "독일 1.분데스리가의 매치 결과와 분석.",
  },
  SERIE_A: {
    name: "세리에 A",
    subtitle: "Serie A (이탈리아)",
    gradient: "from-sky-500 via-blue-700 to-emerald-600",
    copy: "이탈리아 세리에 A의 매치 결과와 분석.",
  },
  LIGUE_1: {
    name: "리그 1",
    subtitle: "Ligue 1 (프랑스)",
    gradient: "from-blue-700 via-rose-600 to-indigo-600",
    copy: "프랑스 리그 1의 매치 결과와 분석.",
  },
  MLS: {
    name: "MLS",
    subtitle: "Major League Soccer (미국·캐나다)",
    gradient: "from-red-600 via-slate-900 to-blue-700",
    copy: "북미 MLS의 매치 결과와 분석.",
  },
  UCL: {
    name: "챔피언스리그",
    subtitle: "UEFA Champions League",
    gradient: "from-indigo-700 via-blue-600 to-cyan-500",
    copy: "유럽 클럽 챔피언을 가리는 UEFA 챔피언스리그 분석.",
  },
  WORLD_CUP: {
    name: "FIFA 월드컵 2026",
    subtitle: "FIFA World Cup 26 (북중미)",
    gradient: "from-amber-500 via-rose-500 to-fuchsia-600",
    copy:
      "북중미(미국·캐나다·멕시코) 공동 개최 2026 FIFA 월드컵의 조별예선부터 결승까지의 매치 프리뷰·결과·분석.",
  },
  KBO: {
    name: "KBO 리그",
    subtitle: "한국프로야구 (Korea Baseball Organization)",
    gradient: "from-blue-600 via-indigo-600 to-rose-500",
    copy:
      "KIA·삼성·LG·두산·KT·SSG·롯데·한화·NC·키움 10팀이 144경기를 치르는 한국 프로야구. 매일 자동 업데이트되는 경기 결과·분석.",
  },
};

const TAB_LABEL: Record<FilterType, string> = {
  ALL: "전체",
  RECAP: "📝 리뷰",
  PREVIEW: "🔮 프리뷰",
  ANALYSIS: "📊 분석",
};

const TYPE_DESC: Record<FilterType, string> = {
  ALL: "프리뷰·리뷰·분석 모두 모아보기",
  RECAP: "이미 끝난 경기에 대한 결과 정리·해설",
  PREVIEW: "예정된 경기에 대한 사전 분석·전망",
  ANALYSIS: "시즌·팀·트렌드에 대한 심층 분석",
};

interface Props {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}

const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase();
  if (!VALID_LEAGUES.includes(upper as ValidLeague)) {
    return { title: "Not Found" };
  }
  const info = LEAGUE_INFO[upper as ValidLeague];
  const type = (sp.type?.toUpperCase() ?? "ALL") as FilterType;
  const validType = VALID_TYPES.includes(type) ? type : "ALL";
  const titleSuffix =
    validType === "ALL"
      ? ""
      : ` · ${TAB_LABEL[validType].replace(/^\W+\s*/, "")}`;
  return {
    title: `${info.name}${titleSuffix}`,
    description: TYPE_DESC[validType] + " — " + info.copy,
  };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase();
  if (!VALID_LEAGUES.includes(upper as ValidLeague)) notFound();
  const info = LEAGUE_INFO[upper as ValidLeague];

  const requested = (sp.type?.toUpperCase() ?? "ALL") as FilterType;
  const currentType: FilterType = VALID_TYPES.includes(requested)
    ? requested
    : "ALL";

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.ArticleWhereInput = {
    status: "PUBLISHED",
    league: upper,
  };
  if (currentType !== "ALL") where.type = currentType;
  // PREVIEW 는 다가오는(미래) 매치만 — 이미 끝난 매치의 PREVIEW 는 ALL/RECAP 에서 봄.
  // (PREVIEW 글은 항상 match 관계가 있음)
  if (currentType === "PREVIEW") {
    where.match = { startTime: { gte: new Date() } };
  }

  // 정렬: PREVIEW 는 다가오는 매치 순(가장 가까운 킥오프 먼저),
  // RECAP 은 최근 끝난 매치 순. ALL / ANALYSIS 는 발행순 유지.
  // match null 인 글(ANALYSIS 등)은 마지막으로 (nulls last) — 보조 publishedAt desc.
  const articleOrderBy: Prisma.ArticleOrderByWithRelationInput[] =
    currentType === "PREVIEW"
      ? [{ match: { startTime: "asc" } }, { publishedAt: "desc" }]
      : currentType === "RECAP"
        ? [{ match: { startTime: "desc" } }, { publishedAt: "desc" }]
        : [{ publishedAt: "desc" }];

  // 카운트는 type 별로 동시에 — 탭에 숫자 표시용
  const [articles, totalArticles, countsByType, accStats] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: articleOrderBy,
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.article.count({ where }),
    prisma.article.groupBy({
      by: ["type"],
      where: { status: "PUBLISHED", league: upper },
      _count: { _all: true },
    }),
    // AI 적중률 미니 — 백테스트 결과 기준
    prisma.match.findMany({
      where: { league: upper, predCorrect: { not: null } },
      select: {
        predCorrect: true,
        predHome: true,
        predDraw: true,
        predAway: true,
        predDcCorrect: true,
        predOverCorrect: true,
        predHcCorrect: true,
        predBttsCorrect: true,
      },
    }),
  ]);

  function rateOf(key: keyof (typeof accStats)[number]) {
    const arr = accStats.filter((m) => m[key] !== null);
    const correct = arr.filter((m) => m[key] === true).length;
    return {
      evaluated: arr.length,
      correct,
      rate: arr.length > 0 ? correct / arr.length : 0,
    };
  }
  const r1x2 = rateOf("predCorrect");
  const rDc = rateOf("predDcCorrect");
  const rOver = rateOf("predOverCorrect");
  const rHc = rateOf("predHcCorrect");
  const rBtts = rateOf("predBttsCorrect");
  // AI Strong Pick — 65%+ 고신뢰
  const strongArr = accStats.filter((m) => {
    const top = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
    return top >= 0.65;
  });
  const rStrong = {
    evaluated: strongArr.length,
    correct: strongArr.filter((m) => m.predCorrect).length,
    rate:
      strongArr.length > 0
        ? strongArr.filter((m) => m.predCorrect).length / strongArr.length
        : 0,
  };
  const isSoccer = ["EPL","LALIGA","BUNDESLIGA","SERIE_A","LIGUE_1","MLS","UCL","WORLD_CUP"].includes(upper);

  const totalAll = countsByType.reduce((s, c) => s + c._count._all, 0);
  const countMap = new Map<FilterType, number>([["ALL", totalAll]]);
  for (const c of countsByType) {
    countMap.set(c.type as FilterType, c._count._all);
  }

  return (
    <div>
      {/* 히어로 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${info.gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14">
          <div
            className={`inline-block bg-gradient-to-br ${info.gradient} bg-clip-text text-transparent text-xs font-bold tracking-[0.2em] uppercase mb-2`}
          >
            {info.subtitle}
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            {info.name}
            {currentType !== "ALL" && (
              <span className="ml-3 text-2xl sm:text-3xl text-neutral-400 font-bold">
                {TAB_LABEL[currentType].replace(/^\W+\s*/, "")}
              </span>
            )}
          </h1>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400 max-w-xl">
            {TYPE_DESC[currentType]}
          </p>

          {r1x2.evaluated > 0 && (
            <div className="mt-5">
              <div className="flex flex-wrap gap-2">
                {rStrong.evaluated >= 5 && (
                  <AccPill
                    icon="⭐"
                    label="Strong Pick"
                    rate={rStrong}
                    tone="amber"
                  />
                )}
                <AccPill icon="🎯" label="1X2" rate={r1x2} tone="neutral" />
                {isSoccer && (
                  <AccPill icon="✨" label="DC" rate={rDc} tone="emerald" />
                )}
                <AccPill icon="📊" label="OVER" rate={rOver} tone="orange" />
                <AccPill icon="⚖️" label="핸디캡" rate={rHc} tone="violet" />
                {isSoccer && (
                  <AccPill icon="⚡" label="BTTS" rate={rBtts} tone="pink" />
                )}
              </div>
              <Link
                href="/predictions/accuracy"
                className="inline-flex items-center gap-1.5 mt-3 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition group"
              >
                <span>모든 리그 적중률 비교 — AI 적중률 보드 바로가기</span>
                <span className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 탭 */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 sticky top-16 bg-white/85 dark:bg-neutral-950/85 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 sm:gap-2 overflow-x-auto">
          {VALID_TYPES.map((t) => {
            const active = t === currentType;
            const count = countMap.get(t) ?? 0;
            const href =
              t === "ALL"
                ? `/leagues/${upper}`
                : `/leagues/${upper}?type=${t}`;
            return (
              <Link
                key={t}
                href={href}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  active
                    ? "border-neutral-900 dark:border-white text-neutral-900 dark:text-white"
                    : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                {TAB_LABEL[t]}
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
            아직 {info.name} {TAB_LABEL[currentType].replace(/^\W+\s*/, "")}{" "}
            기사가 없습니다.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
            <Pagination
              currentPage={pageNum}
              totalPages={Math.ceil(totalArticles / PAGE_SIZE)}
              total={totalArticles}
              league={upper}
              type={currentType}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  total,
  league,
  type,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  league: string;
  type: FilterType;
}) {
  if (totalPages <= 1) return null;

  function makeHref(p: number) {
    const params = new URLSearchParams();
    if (type !== "ALL") params.set("type", type);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/leagues/${league}?${qs}` : `/leagues/${league}`;
  }

  // 페이지 번호 윈도우 — 현재 ±2 + 처음/마지막
  const windowSize = 2;
  const start = Math.max(1, currentPage - windowSize);
  const end = Math.min(totalPages, currentPage + windowSize);
  const nums: (number | "...")[] = [];
  if (start > 1) {
    nums.push(1);
    if (start > 2) nums.push("...");
  }
  for (let i = start; i <= end; i++) nums.push(i);
  if (end < totalPages) {
    if (end < totalPages - 1) nums.push("...");
    nums.push(totalPages);
  }

  return (
    <nav
      aria-label="페이지 이동"
      className="mt-10 flex items-center justify-between flex-wrap gap-3"
    >
      <p className="text-xs text-neutral-500 tabular-nums">
        총 <strong className="text-neutral-700 dark:text-neutral-300">{total.toLocaleString()}</strong>건 ·{" "}
        {currentPage} / {totalPages} 페이지
      </p>
      <div className="flex items-center gap-1.5">
        {currentPage > 1 ? (
          <Link
            href={makeHref(currentPage - 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 transition"
          >
            ← 이전
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-400 cursor-not-allowed">
            ← 이전
          </span>
        )}
        {nums.map((n, i) =>
          n === "..." ? (
            <span key={`dots-${i}`} className="px-2 text-neutral-400 text-sm">
              ···
            </span>
          ) : n === currentPage ? (
            <span
              key={n}
              className="min-w-[2rem] text-center px-2 py-1.5 text-sm rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold tabular-nums"
            >
              {n}
            </span>
          ) : (
            <Link
              key={n}
              href={makeHref(n)}
              className="min-w-[2rem] text-center px-2 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-600 transition tabular-nums"
            >
              {n}
            </Link>
          ),
        )}
        {currentPage < totalPages ? (
          <Link
            href={makeHref(currentPage + 1)}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 transition"
          >
            다음 →
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-400 cursor-not-allowed">
            다음 →
          </span>
        )}
      </div>
    </nav>
  );
}

const PILL_TONES = {
  neutral: {
    border: "border-neutral-300 dark:border-neutral-700",
    bg: "bg-white/60 dark:bg-neutral-900/60",
    label: "text-neutral-500",
    value: "text-neutral-900 dark:text-white",
  },
  emerald: {
    border: "border-emerald-300 dark:border-emerald-700/60",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/30",
    label: "text-emerald-700 dark:text-emerald-400",
    value: "text-emerald-900 dark:text-emerald-200",
  },
  orange: {
    border: "border-orange-300 dark:border-orange-700/60",
    bg: "bg-orange-50/60 dark:bg-orange-950/30",
    label: "text-orange-700 dark:text-orange-400",
    value: "text-orange-900 dark:text-orange-200",
  },
  violet: {
    border: "border-violet-300 dark:border-violet-700/60",
    bg: "bg-violet-50/60 dark:bg-violet-950/30",
    label: "text-violet-700 dark:text-violet-400",
    value: "text-violet-900 dark:text-violet-200",
  },
  pink: {
    border: "border-pink-300 dark:border-pink-700/60",
    bg: "bg-pink-50/60 dark:bg-pink-950/30",
    label: "text-pink-700 dark:text-pink-400",
    value: "text-pink-900 dark:text-pink-200",
  },
  amber: {
    border: "border-amber-400 dark:border-amber-600/70",
    bg: "bg-gradient-to-r from-amber-100/80 to-orange-100/80 dark:from-amber-950/50 dark:to-orange-950/40",
    label: "text-amber-700 dark:text-amber-300",
    value: "text-amber-900 dark:text-amber-100",
  },
} as const;

function AccPill({
  icon,
  label,
  rate,
  tone,
}: {
  icon: string;
  label: string;
  rate: { evaluated: number; correct: number; rate: number };
  tone: keyof typeof PILL_TONES;
}) {
  if (rate.evaluated === 0) return null;
  const t = PILL_TONES[tone];
  return (
    <Link
      href="/predictions/accuracy"
      className={`inline-flex items-center gap-2 rounded-full border ${t.border} ${t.bg} backdrop-blur px-3 py-1.5 text-xs hover:opacity-90 transition`}
    >
      <span aria-hidden>{icon}</span>
      <span className={t.label}>{label}</span>
      <span className={`font-bold tabular-nums ${t.value}`}>
        {Math.round(rate.rate * 100)}%
      </span>
      <span className="text-neutral-400 tabular-nums hidden sm:inline">
        ({rate.correct}/{rate.evaluated})
      </span>
    </Link>
  );
}
