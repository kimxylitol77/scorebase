// /en/benchmark — LLM 예측 캘리브레이션 벤치마크 (영어권 공개용).
//
// ⚠️ 손으로 작성한 영어 전용 페이지다. 대응하는 한국어 원본이 없으므로
//    scripts/en-mirror 가 건드리지 않는다. 여기를 직접 수정한다.
//
// 독자는 HN·r/LocalLLaMA·r/MachineLearning 이다. 이 청중은 표본수·신뢰구간·
// baseline 이 없으면 첫 댓글에서 무너뜨린다. 그래서 원칙이 셋이다.
//   1. 모든 숫자에 n 과 95% CI 를 같이 낸다.
//   2. 주장할 수 없는 것(모델 간 순위)을 우리가 먼저 명시한다.
//   3. 대조군(배당 시장)을 같은 경기에서 같은 방식으로 채점해 나란히 둔다.

import type { Metadata } from "next";
import Link from "next/link";
import { getBenchmarkData } from "@/lib/predict/llm-benchmark";
import { EXCLUSION_NOTE_EN } from "@/lib/predict/scorecard-eligibility";
import { BENCHMARK_LICENSE, MIN_BIN_N } from "@/lib/predict/llm-benchmark";
import CalibrationChart from "@/components/en/benchmark/CalibrationChart";
import { SITE_URL } from "@/lib/site-url";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 3600;

const TITLE = "LLM Forecasting Benchmark — contamination-free by construction";
const DESC =
  "Eight models forecast real sporting events before they happened, scored against a betting-market control. They are well calibrated when unsure and badly overconfident when confident — past roughly 57% stated confidence, extra confidence buys no extra accuracy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/en/benchmark` },
  openGraph: {
    type: "article",
    url: `${SITE_URL}/en/benchmark`,
    title: TITLE,
    description: DESC,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

const MODEL_LABEL: Record<string, string> = {
  scorebase: "Scorebase Elo",
  "gpt-5.6": "GPT-5.6 Sol",
  "gpt-5.5": "GPT-5.5",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  "kimi-k3": "Kimi K3",
  "qwen2.5-32b": "Qwen2.5 32B",
  market: "Betting market",
};
const label = (m: string) => MODEL_LABEL[m] ?? m;

/** 통계 모델·시장은 LLM 이 아니다 — 표에서 대조군으로 구분해 표시한다. */
const NOT_AN_LLM = new Set(["scorebase", "market"]);

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

/** "2026-06-27" → "27 Jun" — 카드 안에서 줄바꿈되지 않게 짧게 쓴다. */
function shortDate(iso: string): string {
  if (!iso) return "";
  const [, m, day] = iso.split("-");
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(day)} ${MONTHS[Number(m) - 1] ?? ""}`.trim();
}

function Stat({ value, label: l }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-xl font-semibold tabular-nums tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-white/45">
        {l}
      </div>
    </div>
  );
}

function H2({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2
      id={id}
      className="mt-14 mb-4 text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl"
    >
      {children}
    </h2>
  );
}

export default async function BenchmarkPage() {
  const d = await getBenchmarkData();

  const llms = d.perModel.filter((m) => !NOT_AN_LLM.has(m.model));
  const elo = d.perModel.find((m) => m.model === "scorebase") ?? null;
  const ranked = [...(d.market ? [d.market] : []), ...(elo ? [elo] : []), ...llms].sort(
    (a, b) => a.ece - b.ece,
  );
  // 헤드라인에 쓸 구간은 표본이 충분한 것 중에서 고른다.
  // 격차만 보고 고르면 n=40 대 구간이 뽑혀 "가장 약한 칸을 인용했다" 는 소리를 듣는다.
  const WELL_POWERED = 300;
  const quotable = d.calibration.filter((b) => b.n >= WELL_POWERED);
  const worstGap = (quotable.length ? quotable : d.calibration).sort(
    (a, b) => a.actual - a.claimed - (b.actual - b.claimed),
  )[0];
  const accSorted = [...llms].sort((a, b) => b.accuracy - a.accuracy);
  const best = accSorted[0];
  const worst = accSorted[accSorted.length - 1];
  const sigWins = d.paired.filter((p) => p.p < 0.05 && p.marketOnly > p.modelOnly).length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Scorebase LLM Forecasting Benchmark",
    description: DESC,
    url: `${SITE_URL}/en/benchmark`,
    temporalCoverage: `${d.from}/${d.to}`,
    variableMeasured: ["stated confidence", "outcome", "Brier score", "expected calibration error"],
    creator: { "@type": "Organization", name: "Scorebase", url: SITE_URL },
    isAccessibleForFree: true,
    license: "https://creativecommons.org/licenses/by/4.0/",
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}/en/benchmark/data.csv` },
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE_URL}/en/benchmark/data.json` },
    ],
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">
        Live benchmark · updated daily
      </p>
      <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-zinc-950 dark:text-white sm:text-[2.6rem]">
        LLMs are honest when unsure, and overconfident when confident
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60 sm:text-base">
        We asked eight models to forecast real sporting events <strong className="text-zinc-900 dark:text-white">before
        they happened</strong>, then scored them on what actually occurred. Because the outcome did not
        exist when the prediction was made, no model could have memorised it — this benchmark is
        contamination-free by construction, and it grows every day.
      </p>
      <p className="mt-4 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60 sm:text-base">
        The headline is not who wins. It is that stated confidence stops carrying information.
        When these models say they are{" "}
        <strong className="text-zinc-900 dark:text-white">{pct(worstGap.claimed, 0)} sure</strong>, they are
        right <strong className="text-zinc-900 dark:text-white">{pct(worstGap.actual, 0)}</strong> of
        the time. A betting market, scored the same way on the same games, sits on the diagonal.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={d.scored.toLocaleString("en-GB")} label="Scored forecasts" />
        <Stat value={d.matches.toLocaleString("en-GB")} label="Events" />
        <Stat value={String(d.models)} label="Models" />
        <Stat value={`${shortDate(d.from)} → ${shortDate(d.to)}`} label="Window" />
      </div>

      <H2 id="calibration">The finding</H2>
      <p className="mb-6 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Each point is a bucket of forecasts grouped by the confidence the forecaster stated. If a
        forecaster were perfectly calibrated, its points would sit on the dashed diagonal.
      </p>
      <CalibrationChart llm={d.calibration} market={d.marketCalibration} />

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/45">
              <th className="py-2.5 pr-3 font-semibold">Stated confidence</th>
              <th className="py-2.5 px-3 font-semibold">Actually right</th>
              <th className="py-2.5 px-3 font-semibold">Gap</th>
              <th className="py-2.5 pl-3 text-right font-semibold">n</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.calibration.map((b, i) => {
              const gap = b.actual - b.claimed;
              return (
                <tr key={i} className="border-b border-zinc-100 dark:border-white/5">
                  <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">{pct(b.claimed)}</td>
                  <td className="py-2.5 px-3 text-zinc-700 dark:text-white/70">
                    {pct(b.actual)}{" "}
                    <span className="text-zinc-400 dark:text-white/35">±{(b.ci * 100).toFixed(1)}</span>
                  </td>
                  <td className={`py-2.5 px-3 font-semibold ${gap < -0.05 ? "text-rose-600 dark:text-rose-400" : "text-zinc-500 dark:text-white/45"}`}>
                    {gap > 0 ? "+" : ""}{(gap * 100).toFixed(1)}pp
                  </td>
                  <td className="py-2.5 pl-3 text-right text-zinc-500 dark:text-white/45">
                    {b.n.toLocaleString("en-GB")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-500 dark:text-white/45">
        Seven LLMs pooled, 1X2 markets, 95% confidence intervals. Buckets are five percentage points
        wide. Above roughly 57% stated confidence the actual hit rate flattens out — the extra
        confidence buys nothing.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-white/45">
        Buckets holding fewer than {MIN_BIN_N} forecasts are not plotted, because a handful of
        forecasts cannot pin down a rate. That hides{" "}
        {d.calibrationHidden.toLocaleString("en-GB")} of {d.calibrationTotal.toLocaleString("en-GB")}{" "}
        forecasts, spread thinly across the extremes. They are all in the downloadable data below —
        bucket them yourself if you want to see them.
      </p>

      <H2 id="ece">Calibration error, model by model</H2>
      <p className="mb-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Expected calibration error is the sample-weighted average distance between stated confidence
        and actual accuracy. The betting market and our own Elo model are included as controls; neither
        is an LLM.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/45">
              <th className="py-2.5 pr-3 font-semibold">Forecaster</th>
              <th className="py-2.5 px-3 text-right font-semibold">ECE</th>
              <th className="py-2.5 px-3 text-right font-semibold">Brier</th>
              <th className="py-2.5 px-3 text-right font-semibold">Accuracy</th>
              <th className="py-2.5 pl-3 text-right font-semibold">n</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {ranked.map((m) => {
              const control = NOT_AN_LLM.has(m.model);
              return (
                <tr
                  key={m.model}
                  className={`border-b border-zinc-100 dark:border-white/5 ${control ? "bg-emerald-50/60 dark:bg-emerald-400/[0.07]" : ""}`}
                >
                  <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">
                    {label(m.model)}
                    {control && (
                      <span className="ml-2 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                        control
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-zinc-900 dark:text-white">{pct(m.ece)}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">{m.brier.toFixed(4)}</td>
                  <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">
                    {pct(m.accuracy)}{" "}
                    <span className="text-zinc-400 dark:text-white/35">±{(m.ci * 100).toFixed(1)}</span>
                  </td>
                  <td className="py-2.5 pl-3 text-right text-zinc-500 dark:text-white/45">
                    {m.n.toLocaleString("en-GB")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <H2 id="cannot-claim">What this data does not show</H2>
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 dark:border-amber-400/25 dark:bg-amber-400/[0.07]">
        <p className="text-[15px] font-semibold text-amber-900 dark:text-amber-200">
          We cannot rank these models by accuracy, and neither should anyone quoting this page.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-amber-900/85 dark:text-amber-100/70">
          Accuracy across the LLMs runs from {pct(worst.accuracy)} ({label(worst.model)}) to{" "}
          {pct(best.accuracy)} ({label(best.model)}), but every confidence interval overlaps every
          other. On this sample the models are statistically indistinguishable from one another on
          hit rate. Calibration is different — the ECE spread above is far larger than the accuracy
          spread, which is why that is the result we lead with.
        </p>
      </div>

      <H2 id="paired">Against the market, paired</H2>
      <p className="mb-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Overlapping intervals do not settle whether the market beats a model, because both forecast
        the same events. McNemar&rsquo;s test compares them game by game and is the appropriate
        analysis. The market significantly outperforms {sigWins} of {d.paired.length}{" "}
        forecasters at p &lt; 0.05, including our own Elo model.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/45">
              <th className="py-2.5 pr-3 font-semibold">Forecaster</th>
              <th className="py-2.5 px-3 text-right font-semibold">Market only</th>
              <th className="py-2.5 px-3 text-right font-semibold">Model only</th>
              <th className="py-2.5 px-3 text-right font-semibold normal-case">χ²</th>
              <th className="py-2.5 pl-3 text-right font-semibold">p</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.paired.map((p) => (
              <tr key={p.model} className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">{label(p.model)}</td>
                <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">{p.marketOnly}</td>
                <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">{p.modelOnly}</td>
                <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">{p.chi2.toFixed(2)}</td>
                <td className={`py-2.5 pl-3 text-right font-semibold ${p.p < 0.05 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400 dark:text-white/35"}`}>
                  {p.p < 0.001 ? "<0.001" : p.p.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-500 dark:text-white/45">
        &ldquo;Market only&rdquo; counts events the market called correctly and the model did not, and
        vice versa. Events where both agree carry no information in this test.
      </p>

      <H2 id="sport">Where the models fall apart</H2>
      <p className="mb-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Baseball has no draw and a high base rate for the stronger side, so picking the favourite
        lands near 53% on its own. Sports with a draw are harder, and that is where the LLMs drop
        below chance while a plain Elo model holds. Sample sizes outside baseball are still small —
        treat this section as preliminary.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/45">
              <th className="py-2.5 pr-3 font-semibold">Forecaster</th>
              <th className="py-2.5 px-3 text-right font-semibold">Baseball</th>
              <th className="py-2.5 pl-3 text-right font-semibold">Everything else</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {d.sportSplit.map((s) => (
              <tr key={s.model} className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">{label(s.model)}</td>
                <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">
                  {s.baseballAcc != null ? pct(s.baseballAcc) : "—"}{" "}
                  <span className="text-zinc-400 dark:text-white/35">n={s.baseballN}</span>
                </td>
                <td className="py-2.5 pl-3 text-right">
                  <span className={s.otherN < 150 ? "text-zinc-400 dark:text-white/35" : "text-zinc-700 dark:text-white/70"}>
                    {s.otherAcc != null ? pct(s.otherAcc) : "—"}
                  </span>{" "}
                  <span className="text-zinc-400 dark:text-white/35">n={s.otherN}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="data">Every row, downloadable</H2>
      <p className="mb-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Publishing only the aggregates would ask you to take our arithmetic on trust. Instead here is
        every scored forecast behind the numbers above — {d.scored.toLocaleString("en-GB")} rows, one
        per model per event, with the timestamp it was written, the confidence stated, the outcome,
        and the bookmaker&rsquo;s implied probabilities so the market control reproduces too.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <a
          href="/en/benchmark/data.csv"
          className="flex-1 rounded-2xl bg-zinc-900 px-5 py-4 text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          <span className="block text-[15px] font-semibold">Download CSV</span>
          <span className="mt-0.5 block text-[13px] opacity-70">
            {d.scored.toLocaleString("en-GB")} rows · spreadsheet-ready
          </span>
        </a>
        <a
          href="/en/benchmark/data.json"
          className="flex-1 rounded-2xl bg-white px-5 py-4 ring-1 ring-black/10 transition hover:bg-zinc-50 dark:bg-white/[0.06] dark:ring-white/15 dark:hover:bg-white/10"
        >
          <span className="block text-[15px] font-semibold text-zinc-950 dark:text-white">Download JSON</span>
          <span className="mt-0.5 block text-[13px] text-zinc-500 dark:text-white/50">
            Same rows plus the computed aggregates
          </span>
        </a>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-zinc-500 dark:text-white/45">
        Released under {BENCHMARK_LICENSE} — use it, cite it, check our arithmetic. If you recompute
        anything and get a different answer, we want to know.
      </p>

      <H2 id="method">Method</H2>
      <div className="space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        <p>
          <strong className="text-zinc-900 dark:text-white">Why contamination is impossible.</strong>{" "}
          Every forecast is written to the database with a timestamp before the event starts, and the
          result is scored afterwards from official feeds. A model cannot have seen the answer during
          training, because the answer did not exist yet. {EXCLUSION_NOTE_EN}
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">Accuracy.</strong> The share of forecasts
          whose pick matched the actual outcome. Intervals are 95% normal approximations.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">Brier.</strong> For the confidence{" "}
          <em>p</em> a forecaster attached to its own pick, we score (1&nbsp;&minus;&nbsp;<em>p</em>)²
          when the pick was right and <em>p</em>² when it was wrong. This is a one-versus-rest score on
          the selected outcome, not a three-way multiclass Brier. Lower is better.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">ECE.</strong> Forecasts are bucketed by
          stated confidence; ECE is the sample-weighted mean of the absolute distance between the
          average stated confidence and the observed hit rate in each bucket.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">The market control.</strong> Bookmaker
          prices for the same events, converted to implied probability, with the highest-probability
          outcome taken as the market&rsquo;s pick and scored identically. It is available for{" "}
          {d.market ? d.market.n.toLocaleString("en-GB") : "0"} of the events.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">Coverage.</strong>{" "}
          {d.leagues.slice(0, 8).map((l) => `${l.league} (${l.n.toLocaleString("en-GB")})`).join(", ")}
          {d.leagues.length > 8 ? `, and ${d.leagues.length - 8} more competitions` : ""}. The mix is
          currently baseball-heavy; football volume is rising as the European season starts.
        </p>
      </div>

      <div className="mt-12 rounded-2xl bg-zinc-50 p-5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <p className="text-[14px] leading-relaxed text-zinc-600 dark:text-white/60">
          Every individual forecast behind these numbers is published before kick-off and kept
          afterwards, win or lose, on the{" "}
          <Link href="/en/predictions/scorecard" className="font-semibold text-rose-600 hover:underline dark:text-rose-400">
            public scorecard
          </Link>
          . Live and upcoming fixtures are on{" "}
          <Link href="/en/scores" className="font-semibold text-rose-600 hover:underline dark:text-rose-400">
            live scores
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
