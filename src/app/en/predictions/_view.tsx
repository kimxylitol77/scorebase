// 시즌 예측 화면 (영어판). scripts/en-mirror 로 자동 생성.
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
  href: string;
}> = [
  { Icon: BarChart3, title: "Elo projections", desc: "Team strength and home/away form, quantified", href: "/predictions/accuracy" },
  { Icon: Trophy, title: "Season simulation", desc: "5,000 Monte Carlo runs — title and relegation probabilities", href: "/predictions/title-race" },
  { Icon: ShieldCheck, title: "Injury impact", desc: "Absences and how much they matter", href: "/injuries" },
  { Icon: Sparkles, title: "AI preview", desc: "The key points, short and sharp", href: "/previews" },
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
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-14" aria-label="About season predictions">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
            <Sparkles className="h-4 w-4" /> Elo plus 5,000 Monte Carlo runs
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-[-0.04em] leading-[1.05] text-zinc-950 dark:text-white">
            Not a hunch —
            <br className="hidden sm:block" /> a season read in numbers.
          </h1>
          <p className="max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/55">
            End-of-season title, play-off and relegation probabilities for 19 leagues on one screen.
            Tap a league card for its table, sport-specific leaderboards (goals and assists, home runs, batting average and ERA, points and rebounds), the full probability spread, remaining fixtures and a team-by-team table.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/predictions/accuracy"
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-medium text-white shadow-xl shadow-black/10 hover:bg-zinc-800 transition dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90"
            >
              <Target className="h-4 w-4" /> AI accuracy board
            </Link>
            <Link
              href="/predictions/scorecard"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-zinc-50 transition dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]"
            >
              <Sparkles className="h-4 w-4" /> AI scorecard (vs GPT-5.6)
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/predictions/title-race"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-zinc-50 transition dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]"
            >
              <Trophy className="h-4 w-4" /> Title race tracker
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              href="/predictions/fifa-ranking"
              className="inline-flex items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-zinc-50 transition dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]"
            >
              <Globe className="h-4 w-4" /> FIFA rankings
            </Link>
          </div>
        </div>
      </section>

      {/* Feature 4-up */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12" aria-label="How we predict">
        <h2 className="sr-only">Our prediction method</h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {featureCards.map(({ Icon, title, desc, href }) => (
            <Link
              key={title}
              href={href}
              className="block rounded-[1.5rem] sm:rounded-[2rem] bg-white p-4 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
            >
              <Icon className="mb-4 sm:mb-6 h-6 w-6 sm:h-7 sm:w-7 text-zinc-900 dark:text-white" />
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-950 dark:text-white">
                {title}
              </h3>
              <p className="mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-zinc-600 dark:text-white/55">
                {desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* League cards grid */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
              Season predictions by league
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-white/45">
              19 leagues including the Premier League, LaLiga, Bundesliga, K League, J League, KBO, MLB, NBA, NHL and LCK · current top three preview
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
                    {sportLeagues.length} leagues
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
                                    Waiting on standings data
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
                              View season prediction <ChevronRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* FIFA 국가 랭킹 — 다른 리그 카드처럼 클릭 시 전용 페이지(/predictions/fifa-ranking)로. */}
                  {sport === "Football" && fifaRanking.length > 0 && (
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
                          FIFA rankings
                        </h4>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-white/45">
                          National team rankings · {fifaDate} as of
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
                          View full rankings <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                    </Link>
                  )}
                  {/* 세계 클럽 랭킹 — FIFA 랭킹 옆 카드. 클릭 시 /predictions/club-ranking. */}
                  {sport === "Football" && clubRanking.length > 0 && (
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
                          Club rankings
                        </h4>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-white/45">World football club rankings</p>
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
                          View full rankings <ChevronRight className="h-3 w-3" />
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
              Key league tables
            </h2>
            <p className="text-sm text-zinc-500 dark:text-white/45">
              Current top three in baseball (KBO, NPB, MLB) and Korean plus big-five football — tap a league for the full prediction.{" "}
              <Link href="/standings" prefetch={false} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                All league tables worldwide →
              </Link>
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
                    {g.leagues.length} leagues
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
          Match reports and season data
        </h2>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          Title, play-off and relegation probabilities for the Premier League, MLB, NBA, KBO and more, from Elo ratings and Monte Carlo
          simulation. Post-match reports and the accuracy board are available too.
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          Each league page also carries live <strong className="font-medium text-zinc-700 dark:text-white/70">league tables</strong>alongside
          <strong className="font-medium text-zinc-700 dark:text-white/70"> sport-specific season leaderboards</strong> (top 10, refreshed daily).
          Football covers goals, assists and cards across the Premier League, LaLiga, Bundesliga, Serie A, K League, J League, MLS and the Champions League;
          baseball covers batting average, home runs, RBI, ERA, wins and strikeouts in KBO, MLB and NPB;
          NBA covers points, assists, rebounds, steals and blocks, and NHL covers goals, assists and points.
          Each also compares the current table with the Elo projection.
        </p>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
          Live match progress is on{" "}
          <Link href="/scores" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Live scores
          </Link>
          , pre-match analysis on{" "}
          <Link href="/previews" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Previews
          </Link>
          . Also see{" "}
          <Link href="/injuries" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            injury lists
          </Link>
          and{" "}
          <Link href="/standings" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            league analysis
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
