// /en 랜딩 — 영어권 진입점: 오늘의 AI 픽 + Standings/Predictions 허브 링크.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { EN_PREDICTION_LEAGUES, enLeagueName } from "@/lib/i18n/en";
import { fetchUpcomingPredicted } from "./_data";
import { MatchPredCard } from "./_components";

export const revalidate = 600;

export const metadata: Metadata = {
  title: {
    absolute: "Scorebase — AI Sports Predictions, Standings & Stats",
  },
  description:
    "Daily AI predictions with win probabilities for Premier League, LaLiga, Bundesliga, MLB, NBA, NHL, KBO and more — powered by Elo ratings, market odds and Monte Carlo simulation. Accuracy tracked and published for every pick.",
  alternates: {
    canonical: `${SITE_URL}/en`,
    languages: {
      ko: SITE_URL,
      en: `${SITE_URL}/en`,
      "x-default": SITE_URL,
    },
  },
};

const HUBS = [
  {
    href: "/en/scores",
    title: "Live Scores",
    desc: "Scores, results and fixtures across football, baseball, basketball, hockey and more — updated around the clock.",
  },
  {
    href: "/en/predictions",
    title: "AI Predictions",
    desc: "Win probabilities, over/under and handicap picks for every upcoming match — with published hit rates.",
  },
  {
    href: "/en/standings",
    title: "League Standings",
    desc: "Live tables for 40+ football leagues plus MLB, KBO and NPB baseball.",
  },
];

export default async function EnHome() {
  const upcoming = await fetchUpcomingPredicted([...EN_PREDICTION_LEAGUES], {
    withinHours: 48,
    limit: 9,
  });

  return (
    <main className="relative mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
          AI Sports Data
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Sports predictions, backed by data.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500 sm:text-base">
          Scorebase runs Elo ratings, starting-pitcher and goalie adjustments, market-odds blending
          and Monte Carlo simulation across{" "}
          {EN_PREDICTION_LEAGUES.length}+ leagues — and publishes the hit rate of every model pick.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HUBS.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            className="group rounded-2xl border border-neutral-200 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
          >
            <h2 className="text-lg font-bold tracking-tight group-hover:underline underline-offset-4">
              {h.title}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">{h.desc}</p>
            <span className="mt-3 inline-block text-xs font-medium text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-700 dark:group-hover:text-neutral-200">
              Explore →
            </span>
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Upcoming AI picks</h2>
          <Link href="/en/predictions" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            All predictions →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/15">
            No predicted matches in the next 48 hours. Check back soon — predictions are generated daily.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((m) => (
              <MatchPredCard key={m.id} m={m} showLeague />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-white/10">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">Leagues we cover</h2>
        <div className="flex flex-wrap gap-2">
          {EN_PREDICTION_LEAGUES.map((lg) => (
            <Link
              key={lg}
              href={`/en/predictions/${lg}`}
              className="rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
            >
              {enLeagueName(lg)}
            </Link>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Every prediction is a probability, not a certainty. After each match we grade our own pick
          and publish the result — no cherry-picking. The full experience with articles, live scores
          and community is available on the{" "}
          <Link href="/" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Korean site
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
