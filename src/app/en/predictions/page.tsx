// /en/predictions — 영어판 예측 허브: 리그 카드 + 임박 Strong Pick 하이라이트.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { EN_PREDICTION_LEAGUES, enLeagueName } from "@/lib/i18n/en";
import { fetchUpcomingPredicted } from "../_data";
import { MatchPredCard } from "../_components";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "AI Match Predictions — Win Probabilities & Picks",
  description:
    "AI predictions for Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, Champions League, MLB, KBO, NPB, NBA and NHL — 1X2 win probabilities, over/under and handicap picks with published accuracy.",
  alternates: {
    canonical: `${SITE_URL}/en/predictions`,
    languages: {
      ko: `${SITE_URL}/predictions`,
      en: `${SITE_URL}/en/predictions`,
      "x-default": `${SITE_URL}/predictions`,
    },
  },
};

export default async function EnPredictionsRoot() {
  const upcoming = await fetchUpcomingPredicted([...EN_PREDICTION_LEAGUES], {
    withinHours: 72,
    limit: 60,
  });
  const strong = upcoming
    .filter((m) => {
      const p = m.predWinner === "HOME" ? m.predHome : m.predWinner === "AWAY" ? m.predAway : m.predDraw;
      return p != null && p >= 0.65;
    })
    .slice(0, 6);
  const countByLeague = new Map<string, number>();
  for (const m of upcoming) countByLeague.set(m.league, (countByLeague.get(m.league) ?? 0) + 1);

  return (
    <main className="relative mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
          AI Predictions
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Match predictions
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          Win probabilities from Elo ratings blended with market odds, plus starting-pitcher (MLB)
          and goalie (NHL) adjustments. Every pick is graded after the match — hit rates are public.
        </p>
      </header>

      {strong.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Strong picks (65%+ confidence)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {strong.map((m) => (
              <MatchPredCard key={m.id} m={m} showLeague />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">By league</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {EN_PREDICTION_LEAGUES.map((lg) => {
            const n = countByLeague.get(lg) ?? 0;
            return (
              <Link
                key={lg}
                href={`/en/predictions/${lg}`}
                prefetch={false}
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{enLeagueName(lg)}</span>
                  <span className="text-xs text-neutral-400">→</span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {n > 0 ? `${n} predicted ${n === 1 ? "match" : "matches"} in 72h` : "Predictions & recent results"}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-white/10">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">How the model works</h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Scorebase maintains an Elo rating for every team (with margin-of-victory weighting),
          adjusts for starting pitchers in MLB/KBO and starting goalies in NHL, then blends the
          model output with bookmaker consensus odds. Season outlooks run Monte Carlo simulation
          over the remaining schedule. Predictions are probabilities, not guarantees — check{" "}
          <Link href="/en/standings" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            standings
          </Link>{" "}
          for current form.
        </p>
      </section>
    </main>
  );
}
