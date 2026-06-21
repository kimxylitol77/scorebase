// 리그 페이지 — 리그별 일정·결과·순위 허브.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import ArticleCard from "@/components/ArticleCard";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import StandingsOnlyView from "@/components/StandingsOnlyView";
import LeagueStandingsTable from "@/components/leagues/LeagueStandingsTable";
import LeagueFixtures from "@/components/leagues/LeagueFixtures";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import { ALL_LEAGUES, LEAGUE_DISPLAY, getLeagueFlag } from "@/lib/sports/sport-leagues";

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
  "NPB",
  "LOL",
  // 신규 — 아시아 (K1/J1/AFC 글 자동생성, K2/J2 등은 수집만)
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "J2_LEAGUE",
  "AFC_CL",
  "AFC_CL_TWO",
  "AFC_U23",
  "SAUDI_PL",
  // 유럽 컵 / 2부
  "UEL",
  "UECL",
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "GREEK_SL",
  // 북중남미
  "BRASILEIRAO",
  "LIGA_MX",
  "COPA_LIB",
  "COPA_SUD",
  // 기타
  "CSL",
  "A_LEAGUE",
  "CLUB_WORLD_CUP",
  // 컵 대회 10개 (2026-05-20)
  "FA_CUP",
  "EFL_CUP",
  "COPA_DEL_REY",
  "COPPA_ITALIA",
  "DFB_POKAL",
  "COUPE_DE_FRANCE",
  "KFA_CUP",
  "EMPEROR_CUP",
  "CONCACAF_CCUP",
  "AFC_CUP",
] as const;
type ValidLeague = (typeof VALID_LEAGUES)[number];

type ArticleType = "PREVIEW" | "RECAP" | "ANALYSIS";
type FilterType = "ALL" | ArticleType;

const VALID_TYPES: FilterType[] = ["ALL", "PREVIEW", "RECAP", "ANALYSIS"];

// 부상자 명단 페이지를 가진 리그 (축구 6 + NBA/MLB/NHL + KBO/NPB)
// UCL 은 소속 리그(EPL/라리가/...)와 중복이라 제외, LoL 은 부상자 개념 부재
const INJURY_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "NBA",
  "MLB",
  "NHL",
  "KBO",
  "NPB",
  // 신규 — api-football 부상자 endpoint 지원
  "K_LEAGUE_1",
  "J1_LEAGUE",
  "SAUDI_PL",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "GREEK_SL",
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "BRASILEIRAO",
  "LIGA_MX",
]);

const LEAGUE_INFO: Partial<Record<
  ValidLeague,
  { name: string; subtitle: string; gradient: string; copy: string }
>> = {
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
  NPB: {
    name: "NPB 리그",
    subtitle: "일본프로야구 (Nippon Professional Baseball)",
    gradient: "from-red-600 via-rose-500 to-pink-500",
    copy:
      "센트럴 리그(요미우리·한신·요코하마·히로시마·주니치·야쿠르트)와 퍼시픽 리그(소프트뱅크·닛폰햄·롯데·오릭스·라쿠텐·세이부) 12팀의 매치 프리뷰·결과·분석.",
  },
  LOL: {
    name: "LCK",
    subtitle: "League of Legends Champions Korea",
    gradient: "from-rose-500 via-fuchsia-600 to-indigo-600",
    copy:
      "T1·Gen.G·한화생명·KT·디플러스 기아·DRX·BNK 피어엑스·한진 브리온·농심 레드포스·DN SOOPers 10팀이 격돌하는 한국 LoL 1부 리그. 정규 스플릿부터 플레이오프·MSI·Worlds까지 매치 일정과 결과.",
  },
  K_LEAGUE_1: {
    name: "K리그 1",
    subtitle: "한국 프로축구 1부",
    gradient: "from-blue-700 via-blue-500 to-sky-400",
    copy:
      "울산 HD·전북 현대·포항 스틸러스·FC 서울·강원 FC·수원 삼성·대구 FC·제주 SK·광주 FC·대전 하나·인천 유나이티드·김천 상무 등 한국 프로축구 1부의 매치 프리뷰·결과·분석.",
  },
  K_LEAGUE_2: {
    name: "K리그 2",
    subtitle: "한국 프로축구 2부",
    gradient: "from-blue-500 via-sky-400 to-cyan-300",
    copy: "한국 프로축구 2부 — 1부 승강 PO 대상 13팀의 정규시즌 매치 일정·결과 (수집만, 글 자동생성 X).",
  },
  J1_LEAGUE: {
    name: "J1 리그",
    subtitle: "일본 프로축구 1부 (Meiji Yasuda J1 League)",
    gradient: "from-pink-600 via-rose-500 to-red-500",
    copy:
      "우라와 레드 다이아몬즈·요코하마 F. 마리노스·카시마 앤틀러스·FC 도쿄·감바 오사카·세레소 오사카·비셀 고베·산프레체 히로시마·가와사키 프론탈레 등 일본 프로축구 1부의 매치 프리뷰·결과·분석. 2월~12월 시즌.",
  },
  AFC_CL: {
    name: "AFC 챔피언스리그 엘리트",
    subtitle: "AFC Champions League Elite",
    gradient: "from-orange-600 via-red-500 to-amber-500",
    copy:
      "아시아 최강 클럽을 가리는 AFC 챔피언스리그 엘리트. 한국·일본·중국·사우디·이란·UAE·태국 등 아시아 24개 클럽이 조별예선·녹아웃 단계를 거쳐 우승을 다툰다.",
  },
};

/** LEAGUE_INFO 미정의 신규 리그를 위한 fallback — sport-leagues LEAGUE_DISPLAY 기반 generic. */
function buildLeagueInfo(code: string): { name: string; subtitle: string; gradient: string; copy: string } {
  const explicit = LEAGUE_INFO[code as ValidLeague];
  if (explicit) return explicit;
  // dynamic import 대신 LEAGUE_DISPLAY 직접 require (server component 이므로 OK)
  const name = LEAGUE_DISPLAY_FALLBACK[code] ?? code;
  return {
    name,
    subtitle: name,
    gradient: "from-slate-600 via-slate-700 to-slate-900",
    copy: `${name} 의 매치 프리뷰·결과·분석.`,
  };
}

const LEAGUE_DISPLAY_FALLBACK: Record<string, string> = {
  J2_LEAGUE: "J2 리그",
  AFC_CL_TWO: "AFC 챔피언스리그 2",
  AFC_U23: "AFC U23 아시안컵",
  SAUDI_PL: "사우디 프로 리그",
  UEL: "유로파 리그",
  UECL: "유로파 컨퍼런스 리그",
  CHAMPIONSHIP: "잉글랜드 챔피언십",
  LALIGA_2: "라리가 2",
  BUNDESLIGA_2: "분데스리가 2",
  SERIE_B: "세리에 B",
  LIGUE_2: "리그 2",
  EREDIVISIE: "에레디비시 (네덜란드)",
  PRIMEIRA_LIGA: "프리메이라 리가 (포르투갈)",
  SUPER_LIG: "쉬페르 리그 (터키)",
  JUPILER_PL: "주피러 프로 리그 (벨기에)",
  SPL: "스코틀랜드 프리미어십",
  GREEK_SL: "그리스 슈퍼리그",
  BRASILEIRAO: "브라질 세리에 A",
  LIGA_MX: "리가 MX (멕시코)",
  COPA_LIB: "코파 리베르타도레스",
  COPA_SUD: "코파 수다메리카나",
  CSL: "중국 슈퍼리그",
  A_LEAGUE: "A-리그 (호주)",
  CLUB_WORLD_CUP: "FIFA 클럽 월드컵",
};

const TAB_LABEL: Record<FilterType, string> = {
  ALL: "전체",
  RECAP: "리뷰",
  PREVIEW: "프리뷰",
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
  searchParams: Promise<{ type?: string; page?: string; view?: string }>;
}

// buildup식 데이터 탭 (축구 리그) — 순위·일정·통계·역사·글
const VIEW_KEYS = ["standings", "fixtures", "stats", "history", "articles"] as const;
type ViewKey = (typeof VIEW_KEYS)[number];
const VIEW_LABEL: Record<ViewKey, string> = {
  standings: "순위",
  fixtures: "일정",
  stats: "통계",
  history: "역사",
  articles: "글",
};

const PAGE_SIZE = 24;

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase();
  // type 필터 뷰는 base 리그 페이지로 canonical — 탭은 부분집합이라 중복 신호 방지
  const canonical = `/leagues/${upper}`;
  if (!VALID_LEAGUES.includes(upper as ValidLeague)) {
    if ((ALL_LEAGUES as readonly string[]).includes(upper)) {
      const name = LEAGUE_DISPLAY[upper] ?? upper;
      return {
        title: `${name} 순위`,
        description: `${name} 현재 시즌 순위표.`,
        alternates: { canonical },
      };
    }
    return { title: "Not Found" };
  }
  const info = buildLeagueInfo(upper);
  const type = (sp.type?.toUpperCase() ?? "ALL") as FilterType;
  const validType = VALID_TYPES.includes(type) ? type : "ALL";
  const titleSuffix =
    validType === "ALL"
      ? ""
      : ` · ${TAB_LABEL[validType].replace(/^\W+\s*/, "")}`;
  return {
    title: `${info.name} 경기 프리뷰·결과·분석${titleSuffix}`,
    description: TYPE_DESC[validType] + " — " + info.copy,
    alternates: { canonical },
  };
}

export default async function LeaguePage({ params, searchParams }: Props) {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase();
  if (!VALID_LEAGUES.includes(upper as ValidLeague)) {
    // ALL_LEAGUES 안에 있으면 순위표만 (글 카드는 데이터 적어서 fallback 제공 안 함)
    if ((ALL_LEAGUES as readonly string[]).includes(upper)) {
      return <StandingsOnlyView league={upper} />;
    }
    notFound();
  }
  const info = buildLeagueInfo(upper);

  const requested = (sp.type?.toUpperCase() ?? "ALL") as FilterType;
  const currentType: FilterType = VALID_TYPES.includes(requested)
    ? requested
    : "ALL";

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  // WORLD_CUP 페이지는 친선(INTL_FRIENDLY) 글도 함께 노출 — 예선/대비전 컨텍스트.
  // (글 카드의 leagueDisplay 는 article.league 기준이라 친선 글은 "친선" 라벨 유지.)
  const leagueFilter: Prisma.StringFilter | string =
    upper === "WORLD_CUP" ? { in: ["WORLD_CUP", "INTL_FRIENDLY"] } : upper;

  const where: Prisma.ArticleWhereInput = {
    status: "PUBLISHED",
    league: leagueFilter,
  };
  if (currentType !== "ALL") where.type = currentType;

  // 정렬: PREVIEW / RECAP 은 매치 킥오프 desc (큰 날짜 = 최근/미래가 위로).
  // ALL / ANALYSIS 는 매치 없는 글(ANALYSIS) 도 섞이므로 발행순 유지.
  const articleOrderBy: Prisma.ArticleOrderByWithRelationInput[] =
    currentType === "PREVIEW" || currentType === "RECAP"
      ? [{ match: { startTime: "desc" } }, { publishedAt: "desc" }]
      : [{ publishedAt: "desc" }];

  // 카운트는 type 별로 동시에 — 탭에 숫자 표시용
  const [articles, totalArticles, countsByType, accStats] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: articleOrderBy,
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        match: {
          select: {
            startersUpdatedAt: true,
            homeStarter: true,
            awayStarter: true,
            startTime: true,
          },
        },
      },
    }),
    prisma.article.count({ where }),
    prisma.article.groupBy({
      by: ["type"],
      where: { status: "PUBLISHED", league: leagueFilter },
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
  const isSoccer = ["EPL","LALIGA","BUNDESLIGA","SERIE_A","LIGUE_1","MLS","UCL","WORLD_CUP","K_LEAGUE_1","K_LEAGUE_2","J1_LEAGUE","J2_LEAGUE","AFC_CL","AFC_CL_TWO","AFC_U23","SAUDI_PL","UEL","UECL","CHAMPIONSHIP","LALIGA_2","BUNDESLIGA_2","SERIE_B","LIGUE_2","EREDIVISIE","PRIMEIRA_LIGA","SUPER_LIG","JUPILER_PL","SPL","GREEK_SL","BRASILEIRAO","LIGA_MX","COPA_LIB","COPA_SUD","CSL","A_LEAGUE","CLUB_WORLD_CUP"].includes(upper);

  // view 결정 — 축구만 데이터 탭(순위 기본), 비축구는 기존 글 화면 유지
  const reqView = (sp.view ?? "").toLowerCase();
  const view: ViewKey = isSoccer
    ? ((VIEW_KEYS as readonly string[]).includes(reqView) ? (reqView as ViewKey) : "standings")
    : "articles";
  const leaderboard = isSoccer && view === "stats" ? await loadLeagueLeaderboard(upper) : null;

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
            {getLeagueFlag(upper) && (
              <span className="mr-2 align-middle" aria-hidden>{getLeagueFlag(upper)}</span>
            )}
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
                <AccPill icon="🎯" label={isSoccer ? "1X2" : "승패"} rate={r1x2} tone="neutral" />
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

      {/* buildup식 데이터 탭 (축구) — 순위·일정·통계·역사·글 */}
      {isSoccer && (
        <div className="border-b border-neutral-200 dark:border-neutral-800 sticky top-16 bg-white/85 dark:bg-neutral-950/85 backdrop-blur z-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-x-1 sm:gap-x-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            {VIEW_KEYS.map((v) => {
              const active = v === view;
              return (
                <Link
                  key={v}
                  href={v === "standings" ? `/leagues/${upper}` : `/leagues/${upper}?view=${v}`}
                  className={`px-3 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition ${
                    active
                      ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                      : "border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  }`}
                >
                  {VIEW_LABEL[v]}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* view별 콘텐츠 */}
      {isSoccer && view === "standings" && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <LeagueStandingsTable league={upper} />
        </div>
      )}
      {isSoccer && view === "fixtures" && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <LeagueFixtures league={upper} />
        </div>
      )}
      {isSoccer && view === "stats" && leaderboard && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <LeagueLeaderBoard league={upper} season={leaderboard.season} rowsByCategory={leaderboard.rowsByCategory} />
        </div>
      )}
      {isSoccer && view === "history" && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center space-y-2">
            <div className="text-3xl">🏆</div>
            <h3 className="text-base font-bold">역대 우승 기록 준비 중</h3>
            <p className="text-sm text-neutral-500 max-w-md mx-auto">{info.name} 역대 우승팀·시즌별 기록을 수집 중입니다. 곧 추가됩니다.</p>
          </div>
        </div>
      )}

      {view === "articles" && (
      <>
      {/* 탭 — 모바일에서는 wrap 2줄, 태블릿+ 에서는 한 줄 가로 스크롤 */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 sticky top-16 bg-white/85 dark:bg-neutral-950/85 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-x-1 sm:gap-x-2 gap-y-0 flex-wrap sm:flex-nowrap sm:overflow-x-auto">
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
                className={`px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
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
          {/* 부상자명단 — 축구 6 + NBA/MLB/NHL + KBO/NPB */}
          {INJURY_LEAGUES.has(upper) && (
            <Link
              href={`/injuries/${upper}`}
              className="px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
            >
              🩹 부상자명단
            </Link>
          )}
          {/* NBA 트랜잭션·연봉 — 트레이드/FA 피드(ESPN) + 연봉 랭킹(basketball-reference) */}
          {upper === "NBA" && (
            <>
              <Link
                href="/transactions/nba"
                className="px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
              >
                🔄 트랜잭션
              </Link>
              <Link
                href="/salaries/nba"
                className="px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
              >
                💰 연봉
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 글 목록 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {articles.length === 0 ? (
          <EmptyArticles league={upper} type={currentType} leagueName={info.name} />
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
        </>
      )}
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

/** 글 0건 일 때 안내 — 종목·리그·탭에 따라 센스 있게 분기. */
function EmptyArticles({
  league,
  type,
  leagueName,
}: {
  league: string;
  type: FilterType;
  leagueName: string;
}) {
  const isBaseball = league === "KBO" || league === "NPB";
  const isPreview = type === "PREVIEW";
  const isRecap = type === "RECAP";
  const isAnalysis = type === "ANALYSIS";

  const tabLabel = TAB_LABEL[type].replace(/^\W+\s*/, "");

  // 야구 + 프리뷰: 선발 라인업 안내
  if (isBaseball && isPreview) {
    return (
      <div className="rounded-2xl border border-dashed border-blue-300/40 dark:border-blue-500/30 bg-blue-50/30 dark:bg-blue-500/5 px-6 py-12 text-center space-y-3">
        <div className="text-3xl">⚾</div>
        <h3 className="text-base font-bold text-blue-700 dark:text-blue-300">
          선발 발표 후 자동 등록됩니다
        </h3>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-md mx-auto">
          {leagueName} 프리뷰는 양팀 선발투수가 확정되어야 작성됩니다.
          <br />
          보통 경기 당일 오전 ~ 오후 사이 라인업이 발표되면
          <br />
          최신 폼·구장 환경·예측 모델 통합해 자동 발행됩니다.
        </p>
      </div>
    );
  }

  // 야구 + 리뷰: 경기 종료 후 안내
  if (isBaseball && isRecap) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-300/40 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/5 px-6 py-12 text-center space-y-3">
        <div className="text-3xl">📊</div>
        <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-300">
          경기 종료 직후 자동 등록됩니다
        </h3>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-md mx-auto">
          {leagueName} 리뷰는 경기가 끝나는 즉시 박스스코어와 이닝별 흐름을
          분석해 작성됩니다.
        </p>
        <p className="text-[11px] text-neutral-400 pt-2">
          ⏱ 종료 후 약 10~30분 이내 발행
        </p>
      </div>
    );
  }

  // 일반 프리뷰: 라인업·odds 안내
  if (isPreview) {
    return (
      <div className="rounded-2xl border border-dashed border-blue-300/40 dark:border-blue-500/30 bg-blue-50/30 dark:bg-blue-500/5 px-6 py-12 text-center space-y-3">
        <h3 className="text-base font-bold text-blue-700 dark:text-blue-300">
          매치업 확정 후 자동 등록됩니다
        </h3>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-md mx-auto">
          {leagueName} 프리뷰는 라이브 라인업과 시장 odds 가 확정되는 시점에
          자동 작성됩니다. 부상·최근 폼·예측 모델까지 통합 분석.
        </p>
      </div>
    );
  }

  if (isRecap) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-300/40 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/5 px-6 py-12 text-center space-y-3">
        <h3 className="text-base font-bold text-emerald-700 dark:text-emerald-300">
          경기 종료 후 자동 등록됩니다
        </h3>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-md mx-auto">
          {leagueName} 리뷰는 경기 종료 직후 결과·KPI·핵심 장면을 정리해
          발행됩니다.
        </p>
      </div>
    );
  }

  if (isAnalysis) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-300/40 dark:border-violet-500/30 bg-violet-50/30 dark:bg-violet-500/5 px-6 py-12 text-center space-y-3">
        <div className="text-3xl">📈</div>
        <h3 className="text-base font-bold text-violet-700 dark:text-violet-300">
          시즌 분석은 매주 월요일 발행
        </h3>
        <p className="text-sm text-neutral-500 leading-relaxed max-w-md mx-auto">
          {leagueName} 시즌 트렌드·팀별 심층 분석은 매주 KST 월요일 오전에
          업데이트됩니다.
        </p>
      </div>
    );
  }

  // ALL fallback
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 px-6 py-12 text-center space-y-2">
      <div className="text-3xl">📭</div>
      <p className="text-neutral-500">
        아직 {leagueName} {tabLabel} 글이 없습니다.
      </p>
    </div>
  );
}
