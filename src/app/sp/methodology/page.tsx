// /methodology — 모델 설명(정적). 숫자는 없고 방법만. 상세 벤치마크는 스코어베이스 /en/benchmark/method 링크.
import type { Metadata } from "next";
import { SCOREBASE_EN, spUrl } from "@/lib/sp/site";

export const metadata: Metadata = {
  title: "Methodology — How the Predictions Are Made",
  description: "Elo ratings with margin of victory, a Dixon-Coles goal model for football, a blend with market-implied probabilities, and public grading of every pick.",
  alternates: { canonical: spUrl("/methodology") },
};

const STEPS: [string, string][] = [
  ["Team strength", "Every team carries an Elo rating updated after each match. Margin of victory scales the update, so a 4-0 moves the rating more than a 1-0. Home advantage is a fixed offset per sport."],
  ["Match probabilities", "For football we fit a Dixon-Coles Poisson goal model on top of the ratings to get home, draw and away probabilities. Other sports use the Elo win expectancy directly, so there is no draw bucket."],
  ["Market blend", "Where bookmaker odds exist we remove the vig and blend the market-implied probability with the model. Backtests showed the market alone beats the model on match winner, so the blend leans on the market and the model adds value on totals and handicaps."],
  ["Publish gate", "A pick is only published when it clears a confidence threshold, and never against the market favourite unless the model is above 60%. Weak contrarian picks lost money in backtests, so we do not show them."],
  ["AI panel", "Independently of the statistical model, several large language models are asked to predict the same fixtures before kick-off. Their picks are timestamped and graded exactly like ours, and shown side by side on the accuracy page."],
  ["Grading", "Once a result is final each pick is marked hit or miss. Postponed or abandoned matches are not graded. Predictions created after kick-off are excluded from every statistic."],
];

export default function MethodologyPage() {
  return (
    <>
      <section className="py-10">
        <p className="sp-eyebrow">How it works</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">Methodology</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>Predictions are statistical estimates, not tips. Here is exactly what produces the numbers on this site.</p>
      </section>
      <ol className="grid gap-4">
        {STEPS.map(([h, body], i) => (
          <li key={h} className="sp-card p-6">
            <div className="sp-mono text-xs font-bold" style={{ color: "var(--sp-lime)" }}>0{i + 1}</div>
            <h2 className="mt-1 text-xl font-extrabold">{h}</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>{body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm" style={{ color: "var(--sp-fg-muted)" }}>Full benchmark notes, calibration curves and data sources are published on <a className="underline" href={`${SCOREBASE_EN}/benchmark/method`}>Scorebase</a>, which runs the models.</p>
    </>
  );
}
