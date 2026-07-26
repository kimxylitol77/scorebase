// /en/predictions/[league] — 영어판 리그 예측: 임박 경기 확률·픽 + 최근 판정 결과(투명 공개).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { enLeagueName, EN_PREDICTION_LEAGUE_SET, EN_STANDINGS_LEAGUE_SET } from "@/lib/i18n/en";
import { fetchUpcomingPredicted, fetchRecentJudged } from "../../_data";
import { MatchPredCard, JudgedRow } from "../../_components";

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

export default async function EnPredictionsLeague({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!EN_PREDICTION_LEAGUE_SET.has(upper)) notFound();

  const name = enLeagueName(upper);
  const [upcoming, judged] = await Promise.all([
    fetchUpcomingPredicted([upper], { withinHours: 24 * 7, limit: 30 }),
    fetchRecentJudged(upper, 12),
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
