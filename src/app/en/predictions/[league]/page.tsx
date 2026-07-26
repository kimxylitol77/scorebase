// /en/predictions/[league] — 영어판 리그 예측: 임박 경기 확률·픽 + 최근 판정 결과(투명 공개).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { enLeagueName, EN_PREDICTION_LEAGUE_SET, EN_STANDINGS_LEAGUE_SET } from "@/lib/i18n/en";
import { fetchUpcomingPredicted, fetchRecentJudged } from "../../_data";
import { MatchPredCard, JudgedRow } from "../../_components";
import { runEnSeasonSim, EN_SIM_LEAGUES, type EnSimResult } from "../../_season-sim";

export const revalidate = 600;

interface Props {
  params: Promise<{ league: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!EN_PREDICTION_LEAGUE_SET.has(upper)) return {};
  const name = enLeagueName(upper);
  return {
    title: `${name} Predictions — AI Win Probabilities`,
    description: `AI predictions for upcoming ${name} matches — win probabilities, over/under and handicap picks, with every past pick graded and published.`,
    alternates: {
      canonical: `${SITE_URL}/en/predictions/${upper}`,
      languages: {
        ko: `${SITE_URL}/predictions/${upper}`,
        en: `${SITE_URL}/en/predictions/${upper}`,
        "x-default": `${SITE_URL}/predictions/${upper}`,
      },
    },
  };
}

const simPct = (v: number) => (v >= 0.995 ? "99%+" : v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);

function SeasonSimSection({ sim, name }: { sim: EnSimResult; name: string }) {
  const top = sim.rows.slice(0, 10);
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Season outlook</h2>
        <span className="text-xs text-neutral-500">Monte Carlo × 5,000 runs</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
              <th className="px-3 py-2.5 w-10 text-center">#</th>
              <th className="px-3 py-2.5">Team</th>
              <th className="px-2 py-2.5 text-center">1st place</th>
              {sim.config.playoff && <th className="px-2 py-2.5 text-center">{sim.config.playoff.label}</th>}
              {sim.config.relegationCount > 0 && <th className="px-2 py-2.5 text-center">Relegation</th>}
              {!sim.config.hideXPts && <th className="px-2 py-2.5 text-center">xPts</th>}
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.team} className="border-b border-neutral-100 last:border-0 dark:border-white/5">
                <td className="px-3 py-2 text-center font-bold tabular-nums text-neutral-400">{r.currentPosition}</td>
                <td className="px-3 py-2 font-medium">{r.team}</td>
                <td className="px-2 py-2 text-center tabular-nums font-semibold">{simPct(r.champion)}</td>
                {sim.config.playoff && (
                  <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{simPct(r.playoff ?? 0)}</td>
                )}
                {sim.config.relegationCount > 0 && (
                  <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{simPct(r.relegation ?? 0)}</td>
                )}
                {!sim.config.hideXPts && (
                  <td className="px-2 py-2 text-center tabular-nums text-neutral-500">{r.expectedPoints.toFixed(0)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-neutral-400">
        Probability of finishing 1st in the overall {name} table, from 5,000 Monte Carlo simulations
        of the remaining schedule using Elo-based match probabilities. # is the current standings
        position{sim.config.hideXPts ? "" : "; xPts is the average simulated final points"}. Top 10
        shown.
      </p>
    </section>
  );
}

export default async function EnPredictionsLeague({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!EN_PREDICTION_LEAGUE_SET.has(upper)) notFound();

  const name = enLeagueName(upper);
  const [upcoming, judged, sim] = await Promise.all([
    fetchUpcomingPredicted([upper], { withinHours: 24 * 7, limit: 30 }),
    fetchRecentJudged(upper, 12),
    upper in EN_SIM_LEAGUES ? runEnSeasonSim(upper) : Promise.resolve(null),
  ]);
  const hits = judged.filter((m) => m.predCorrect).length;

  return (
    <main className="relative mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <nav className="text-xs text-neutral-400">
          <Link href="/en/predictions" className="hover:underline">
            Predictions
          </Link>{" "}
          / {name}
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{name} predictions</h1>
        <p className="text-sm text-neutral-500">
          Win probabilities from our Elo + market-blend model.
          {EN_STANDINGS_LEAGUE_SET.has(upper) && (
            <>
              {" "}
              <Link
                href={`/en/standings/${upper}`}
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                View standings
              </Link>
              .
            </>
          )}
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Upcoming matches</h2>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/15">
            No predicted {name} matches in the next 7 days. Predictions are generated daily as
            fixtures approach.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchPredCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      {sim && <SeasonSimSection sim={sim} name={name} />}

      {judged.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Recent results</h2>
            <span className="text-xs tabular-nums text-neutral-500">
              model {hits}/{judged.length} correct
            </span>
          </div>
          <div className="space-y-2">
            {judged.map((m) => (
              <JudgedRow key={m.id} m={m} />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-neutral-400">
            Every pick is graded automatically after the final whistle — wins and losses alike.
          </p>
        </section>
      )}
    </main>
  );
}
