// /en/predictions/accuracy — AI 예측 적중률 영어판. 집계는 ko 와 공용(lib/predict/accuracy-stats)
// 이라 두 언어 페이지가 항상 같은 숫자를 보여준다.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import {
  ACCURACY_LEAGUES,
  statForLeague,
  type MarketRate,
  type LeagueStat,
} from "@/lib/predict/accuracy-stats";
import { enLeagueName, EN_PREDICTION_LEAGUE_SET } from "@/lib/i18n/en";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "AI Prediction Accuracy — Verified Hit Rates by League",
  description:
    "Real, verified hit rates of Scorebase AI predictions — 1X2, over/under, handicap and BTTS accuracy with sample sizes for the Premier League, LaLiga, MLB, NBA, NHL, KBO and more. Backtested on every graded match, wins and losses alike.",
  alternates: {
    canonical: `${SITE_URL}/en/predictions/accuracy`,
    languages: {
      ko: `${SITE_URL}/predictions/accuracy`,
      en: `${SITE_URL}/en/predictions/accuracy`,
      "x-default": `${SITE_URL}/predictions/accuracy`,
    },
  },
};

// LOL 은 en 사이트에서 리그명만 LCK 로 표기 (예측 상세 페이지는 미지원이라 링크 없음)
const EN_ACC_NAME: Record<string, string> = { LOL: "LCK" };

const pct = (r: MarketRate) => (r.evaluated > 0 ? `${(r.rate * 100).toFixed(1)}%` : "—");
const frac = (r: MarketRate) => (r.evaluated > 0 ? `${r.correct}/${r.evaluated}` : "no sample");

function MarketCell({ r }: { r: MarketRate }) {
  if (r.evaluated === 0) return <td className="px-2 py-2 text-center text-neutral-400">—</td>;
  const good = r.rate >= 0.55;
  return (
    <td className="px-2 py-2 text-center tabular-nums">
      <span className={good ? "font-bold text-emerald-600 dark:text-emerald-400" : "font-semibold"}>
        {pct(r)}
      </span>
      <span className="block text-[10px] text-neutral-400">{frac(r)}</span>
    </td>
  );
}

function LeagueRow({ s }: { s: LeagueStat }) {
  const name = EN_ACC_NAME[s.league] ?? enLeagueName(s.league);
  const linked = EN_PREDICTION_LEAGUE_SET.has(s.league);
  return (
    <tr className="border-b border-neutral-100 last:border-0 dark:border-white/5">
      <td className="px-3 py-2 font-medium">
        {linked ? (
          <Link href={`/en/predictions/${s.league}`} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
      </td>
      <MarketCell r={s.oneXTwo} />
      <MarketCell r={s.strong} />
      <MarketCell r={s.over} />
      <MarketCell r={s.hc} />
      {s.isSoccer ? <MarketCell r={s.btts} /> : <td className="px-2 py-2 text-center text-neutral-400">—</td>}
    </tr>
  );
}

export default async function EnAccuracyPage() {
  const stats = (await Promise.all(ACCURACY_LEAGUES.map((lg) => statForLeague(lg)))).filter(
    (s) => s.oneXTwo.evaluated > 0,
  );
  const totalEvaluated = stats.reduce((a, s) => a + s.oneXTwo.evaluated, 0);
  const totalCorrect = stats.reduce((a, s) => a + s.oneXTwo.correct, 0);

  return (
    <main className="relative mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <nav className="text-xs text-neutral-400">
          <Link href="/en/predictions" className="hover:underline">
            Predictions
          </Link>{" "}
          / Accuracy
        </nav>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          AI prediction accuracy
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500">
          Every model pick is graded automatically after the final whistle and counted here — wins
          and losses alike, no cherry-picking. Across all leagues the 1X2 model is{" "}
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">
            {totalCorrect.toLocaleString()}/{totalEvaluated.toLocaleString()} (
            {totalEvaluated > 0 ? ((totalCorrect / totalEvaluated) * 100).toFixed(1) : "0"}%)
          </span>{" "}
          on graded matches to date.
        </p>
      </header>

      <section className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-white/10">
              <th className="px-3 py-2.5">League</th>
              <th className="px-2 py-2.5 text-center">1X2</th>
              <th className="px-2 py-2.5 text-center">Strong pick</th>
              <th className="px-2 py-2.5 text-center">Over/Under</th>
              <th className="px-2 py-2.5 text-center">Handicap</th>
              <th className="px-2 py-2.5 text-center">BTTS</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <LeagueRow key={s.league} s={s} />
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-white/10">
        <h2 className="text-base font-bold tracking-tight sm:text-lg">Methodology</h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Predictions are generated before kickoff from Elo ratings (with margin-of-victory
          weighting), starting-pitcher and goalie adjustments, and a blend with bookmaker consensus
          odds. After each match finishes, the pick is compared with the actual result and stored —
          the numbers above are point-in-time backtests over every graded match, not a curated
          subset. &ldquo;Strong pick&rdquo; counts only matches where the model&rsquo;s top
          probability cleared a per-league confidence threshold. Sample sizes are shown under each
          rate; small samples move fast, so judge rates together with their sample.
        </p>
        <p className="text-sm text-neutral-500">
          See today&rsquo;s picks on the{" "}
          <Link href="/en/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            predictions hub
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
