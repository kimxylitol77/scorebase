"use client";

// 리디자인된 /predictions 인덱스 — Apple 톤(라이트) + glassmorphism(다크).
// 데이터는 server 에서 fetch 해 props 로 받음 (page.tsx).
import { Fragment } from "react";
import Link from "next/link";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Sparkles,
  Trophy,
  ShieldCheck,
  Target,
  Globe,
} from "lucide-react";
import {
  LEAGUES,
  SPORT_ORDER,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "./_data";

interface ViewProps {
  top3: Record<string, TopThreeEntry[]>;
  countryGroups: CountryStandingsGroup[];
  /** FIFA 남자 국가대표 랭킹 (rank asc) — 국가대표 섹션 표 */
  fifaRanking: { rank: number; name: string; flag: string }[];
  /** FIFA 랭킹 발표 일자 (YYYY-MM-DD) */
  fifaDate: string;
  /** 세계 클럽 랭킹 top 5 (rank asc) */
  clubRanking: { rank: number; name: string; logo: string | null }[];
}

const featureCards: Array<{
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}> = [
  { Icon: BarChart3, title: "Elo 예측", desc: "팀 전력과 홈/원정 흐름을 수치화" },
  { Icon: Trophy, title: "시즌 시뮬레이션", desc: "Monte Carlo 5,000회 — 우승·강등 확률" },
  { Icon: ShieldCheck, title: "부상자 영향", desc: "결장 변수와 경기 영향도 추적" },
  { Icon: Sparkles, title: "AI 프리뷰", desc: "핵심 포인트를 짧고 선명하게" },
];

export default function PredictionsView({
  top3,
  countryGroups,
  fifaRanking,
  fifaDate,
  clubRanking,
}: ViewProps) {
  return (
    <div className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-14">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
            <Sparkles className="h-4 w-4" /> Elo + Monte Carlo 5,000회 시뮬레이션
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.04em] leading-[1.05] text-zinc-950 dark:text-white">
            감이 아니라,
            <br className="hidden sm:block" /> 숫자로 보는 시즌.
          </h1>
          <p className="max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/55">
            19개 주요 리그의 시즌 종료 시 우승·플레이오프·강등 확률을 한 화면에서.
            각 리그 카드를 누르면 리그 순위표와 종목별 리더보드(축구 득점·도움, 야구 홈런·타율·ERA, 농구 득점·리바운드 등), 상세 확률 분포·잔여 일정·팀별 확률 표까지 볼 수 있어요.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/predictions/accuracy"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-black/10 hover:bg-zinc-800 transition dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90"
            >
              <Target className="h-4 w-4" /> AI 적중률 보드
            </Link>
            <Link
              href="/predictions/title-race"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-zinc-50 transition dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]"
            >
              <Trophy className="h-4 w-4" /> 우승 경쟁 트래커
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/predictions/fifa-ranking"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-zinc-50 transition dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]"
            >
              <Globe className="h-4 w-4" /> FIFA 랭킹
            </Link>
          </div>
        </div>
      </section>

      {/* Feature 4-up */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12">
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {featureCards.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
            >
              <Icon className="mb-4 sm:mb-6 h-6 w-6 sm:h-7 sm:w-7 text-zinc-900 dark:text-white" />
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-zinc-600 dark:text-white/55">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* League cards grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              주요 리그 시즌 예측
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-white/45">
              19개 리그 · Top 3 현재 순위 미리보기
            </p>
          </div>
          <Activity className="hidden sm:block h-6 w-6 text-zinc-400 dark:text-white/40" />
        </div>

        <div className="space-y-10">
          {SPORT_ORDER.map((sport) => {
            const sportLeagues = LEAGUES.filter((l) => l.sport === sport);
            if (sportLeagues.length === 0) return null;
            return (
              <Fragment key={sport}>
                <div className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                    {sport}
                  </h3>
                  <span className="text-xs text-zinc-400 dark:text-white/40 tabular-nums">
                    {sportLeagues.length}개 리그
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {sportLeagues.map((lg) => {
                    const subList = lg.codes ?? [{ code: lg.code, label: lg.name }];
                    const isMulti = subList.length > 1;
                    return (
                      <div
                        key={lg.code}
                        className="group relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.06] dark:shadow-none"
                      >
                        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${lg.gradient}`} />
                        <Link
                          href={`/predictions/${lg.code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          prefetch={false}
                          className="block p-5 pb-3"
                        >
                          <h4 className="text-lg font-semibold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">
                            {lg.name}
                          </h4>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-white/45">{lg.subtitle}</p>
                        </Link>

                        <div className="px-5 pb-5 space-y-3">
                          {subList.map((sub, sidx) => {
                            const top3List = top3[sub.code] ?? [];
                            return (
                              <div
                                key={sub.code}
                                className={
                                  sidx > 0
                                    ? "pt-3 border-t border-black/5 dark:border-white/[0.08]"
                                    : ""
                                }
                              >
                                {isMulti && (
                                  <Link
                                    href={`/predictions/${sub.code}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    prefetch={false}
                                    className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-zinc-700 hover:underline dark:text-white/70"
                                  >
                                    <span>{sub.label}</span>
                                    <ChevronRight className="h-3 w-3 text-zinc-400 dark:text-white/30" />
                                  </Link>
                                )}
                                {top3List.length > 0 ? (
                                  <div className="space-y-1">
                                    {top3List.map((t) => (
                                      <div
                                        key={t.teamId}
                                        className="flex items-center justify-between gap-2 text-xs"
                                      >
                                        <div className="flex min-w-0 items-center gap-2">
                                          <span className="w-4 text-center tabular-nums font-bold text-zinc-400 dark:text-white/35">
                                            {t.position}
                                          </span>
                                          <span className="truncate text-zinc-700 dark:text-white/80">
                                            {t.name}
                                          </span>
                                        </div>
                                        <span className="shrink-0 tabular-nums font-semibold text-zinc-500 dark:text-white/55">
                                          {t.points}p
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] italic text-zinc-400 dark:text-white/35">
                                    순위 데이터 수집 대기 중
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {!isMulti && (
                            <Link
                              href={`/predictions/${lg.code}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              prefetch={false}
                              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition hover:text-zinc-900 dark:text-white/40 dark:hover:text-white"
                            >
                              시즌 예측 보기 <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* FIFA 국가 랭킹 — 다른 리그 카드처럼 클릭 시 전용 페이지(/predictions/fifa-ranking)로. */}
                  {sport === "축구" && fifaRanking.length > 0 && (
                    <Link
                      href="/predictions/fifa-ranking"
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="group relative block overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.06] dark:shadow-none"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400" />
                      <div className="p-5 pb-3">
                        <h4 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">
                          <Globe className="h-4 w-4 text-zinc-500 dark:text-white/50" />
                          FIFA 랭킹
                        </h4>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-white/45">
                          국가대표 순위 · {fifaDate} 기준
                        </p>
                      </div>
                      <div className="px-5 pb-5 space-y-3">
                        <div className="space-y-1">
                          {fifaRanking.slice(0, 5).map((c) => (
                            <div key={c.rank} className="flex items-center gap-2 text-xs">
                              <span className="w-4 text-center tabular-nums font-bold text-zinc-400 dark:text-white/35">
                                {c.rank}
                              </span>
                              <span className="shrink-0 text-sm leading-none">{c.flag}</span>
                              <span className="truncate text-zinc-700 dark:text-white/80">{c.name}</span>
                            </div>
                          ))}
                        </div>
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition group-hover:text-zinc-900 dark:text-white/40 dark:group-hover:text-white">
                          전체 랭킹 보기 <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  )}
                  {/* 세계 클럽 랭킹 — FIFA 랭킹 옆 카드. 클릭 시 /predictions/club-ranking. */}
                  {sport === "축구" && clubRanking.length > 0 && (
                    <Link
                      href="/predictions/club-ranking"
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="group relative block overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.06] dark:shadow-none"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />
                      <div className="p-5 pb-3">
                        <h4 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">
                          <Trophy className="h-4 w-4 text-zinc-500 dark:text-white/50" />
                          클럽 랭킹
                        </h4>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-white/45">세계 축구 클럽 순위</p>
                      </div>
                      <div className="px-5 pb-5 space-y-3">
                        <div className="space-y-1">
                          {clubRanking.slice(0, 5).map((c) => (
                            <div key={c.rank} className="flex items-center gap-2 text-xs">
                              <span className="w-4 text-center tabular-nums font-bold text-zinc-400 dark:text-white/35">{c.rank}</span>
                              {c.logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.logo} alt="" className="w-4 h-4 shrink-0 object-contain" />
                              ) : (
                                <span className="w-4 shrink-0" />
                              )}
                              <span className="truncate text-zinc-700 dark:text-white/80">{c.name}</span>
                            </div>
                          ))}
                        </div>
                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-400 transition group-hover:text-zinc-900 dark:text-white/40 dark:group-hover:text-white">
                          전체 랭킹 보기 <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  )}
                </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </section>

      {/* Country grouped standings */}
      {countryGroups.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
          <div className="mb-6 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              국가별 리그 순위
            </h2>
            <p className="text-sm text-zinc-500 dark:text-white/45">
              전 세계 축구 리그 현재 순위 (Top 3) — 국가별 정렬. 리그명 클릭 시 시즌 예측 상세.
            </p>
            <nav className="flex flex-wrap gap-1.5 pt-2 text-[11px]">
              {countryGroups.map((g) => (
                <a
                  key={g.country}
                  href={`#country-${g.country}`}
                  className="rounded-full bg-white px-3 py-1 text-zinc-700 ring-1 ring-black/5 transition hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                >
                  {g.country}
                </a>
              ))}
            </nav>
          </div>

          <div className="space-y-6">
            {countryGroups.map((g) => (
              <div key={g.country} id={`country-${g.country}`} className="space-y-3">
                <h3 className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 flex items-center gap-2 bg-[#f5f5f7]/85 backdrop-blur text-sm sm:text-base font-bold text-zinc-950 dark:bg-[#0a0a0a]/85 dark:text-white">
                  <span>{g.country}</span>
                  <span className="text-xs font-normal text-zinc-400 dark:text-white/35">
                    {g.leagues.length}개 리그
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {g.leagues.map((l) => (
                    <Link
                      key={l.league}
                      href={`/predictions/${l.league}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      prefetch={false}
                      className="rounded-[1.25rem] bg-white px-4 py-3 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
                    >
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
                          {l.leagueDisplay}
                        </span>
                        <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400 dark:text-white/30" />
                      </div>
                      <div className="space-y-1">
                        {l.top3.map((t) => (
                          <div
                            key={t.teamId}
                            className="flex items-center justify-between gap-2 text-[11px] sm:text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="w-3 text-center tabular-nums font-bold text-zinc-400 dark:text-white/35">
                                {t.position}
                              </span>
                              <span className="truncate text-zinc-700 dark:text-white/80">
                                {t.name}
                              </span>
                            </div>
                            <span className="shrink-0 tabular-nums font-semibold text-zinc-500 dark:text-white/55">
                              {t.points}p
                            </span>
                          </div>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SEO 본문 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 border-t border-black/5 dark:border-white/10 pt-10 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
          경기 결과 리뷰 및 시즌 데이터 분석
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          EPL, MLB, NBA, KBO 등 주요 리그의 시즌 우승·플레이오프·강등 확률을 Elo 레이팅과 Monte Carlo
          시뮬레이션으로 분석해 제공합니다. 경기 종료 후 결과 리뷰와 적중률 보드도 함께 확인할 수 있습니다.
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          각 리그 상세 페이지에서는 실시간 <strong className="font-medium text-zinc-700 dark:text-white/70">리그 순위표</strong>와 함께
          <strong className="font-medium text-zinc-700 dark:text-white/70"> 종목별 시즌 리더보드</strong>(TOP 10, 매일 자동 갱신)를 제공합니다.
          축구는 EPL·라리가·분데스리가·세리에 A·K리그·J리그·MLS·챔피언스리그 등 주요 리그의 득점·도움·경고·퇴장 순위,
          야구는 KBO·MLB·NPB의 타율·홈런·타점·평균자책(ERA)·다승·탈삼진 순위,
          농구 NBA는 득점·어시스트·리바운드·스틸·블록, 아이스하키 NHL은 골·어시스트·포인트 순위를 확인할 수 있습니다.
          현재 순위 대비 Elo 예측 순위 비교도 함께 제공합니다.
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          실시간 경기 진행은{" "}
          <Link href="/scores" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            라이브스코어
          </Link>
          에서, 경기 전 매치업 분석은{" "}
          <Link href="/previews" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            프리뷰
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
  );
}
