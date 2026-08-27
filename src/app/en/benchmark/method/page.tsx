// /en/benchmark/method — 방법론 전문. 벤치마크를 의심하는 사람이 두 번째로 오는 페이지다.
//
// ⚠️ 손으로 작성한 영어 전용 페이지. en-mirror 가 건드리지 않는다.
//
// 원칙 — 불리한 사실을 우리가 먼저 쓴다. 프롬프트를 원문 그대로 공개하는 이상
// 독자가 직접 읽고 해석할 수 있으므로, 우리가 해석을 내놓지 않으면 "숨겼다" 가 된다.
// 특히 세 가지는 반드시 우리 입으로 말해야 한다.
//   ① 프롬프트가 모델에게 확률을 0.50~0.58 로 낮추라고 지시한다
//   ② 프롬프트가 한국어다
//   ③ 제품의 발행 게이트를 벤치마크에는 적용하지 않는다(적용하면 수치가 부풀려진다)

import type { Metadata } from "next";
import Link from "next/link";
import { getBenchmarkData, BENCHMARK_LICENSE } from "@/lib/predict/llm-benchmark";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 3600;

const TITLE = "Benchmark method — prompts, scoring, and what we did not filter";
const DESC =
  "The full method behind the Scorebase LLM forecasting benchmark: the verbatim prompt, what the models are and are not shown, how each market is scored, and the exclusions we apply — including the product filter we deliberately switch off.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/en/benchmark/method` },
  openGraph: { type: "article", url: `${SITE_URL}/en/benchmark/method`, title: TITLE, description: DESC },
};

const MODEL_LABEL: Record<string, string> = {
  scorebase: "Scorebase Elo", "gpt-5.6": "GPT-5.6 Sol", "gpt-5.5": "GPT-5.5",
  claude: "Claude", gemini: "Gemini", grok: "Grok",
  "kimi-k3": "Kimi K3", "qwen2.5-32b": "Qwen2.5 32B",
};
const label = (m: string) => MODEL_LABEL[m] ?? m;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

function H2({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 id={id} className="mt-14 mb-4 text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
      {children}
    </h2>
  );
}

function Warn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 dark:border-amber-400/25 dark:bg-amber-400/[0.07]">
      <p className="text-[15px] font-semibold text-amber-900 dark:text-amber-200">{title}</p>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-amber-900/85 dark:text-amber-100/70">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-4 overflow-x-auto rounded-2xl bg-zinc-900 p-5 text-[12.5px] leading-relaxed text-zinc-100 ring-1 ring-black/10 dark:bg-black/50 dark:ring-white/10">
      <code>{children}</code>
    </pre>
  );
}

const SYSTEM_KO = `당신은 보수적인 스포츠 경기 분석가입니다. 제공된 사실만 사용해 시장별 결과를 예측합니다. 제공되지 않은 부상, 라인업, 최근 뉴스, 배당 정보는 추정하거나 만들어내지 마세요. 근거가 엇비슷하거나 데이터가 부족하면 확률을 0.50~0.58 범위로 낮추고, 0.70을 넘기는 확률은 명확한 수치 우위가 있을 때만 사용하세요. JSON 외 문장은 답하지 마세요.`;

const SYSTEM_EN = `You are a conservative sports analyst. Predict the outcome of each market using only the facts provided. Do not guess or invent injuries, line-ups, recent news, or odds that were not given to you. If the evidence is evenly balanced or the data is thin, lower your probability into the 0.50–0.58 range; only go above 0.70 when there is a clear numerical edge. Answer with JSON and nothing else.`;

const USER_TEMPLATE = `{LEAGUE} match ({DATE}).
Home: {HOME}
Away: {AWAY}

Verified match data:
{FACTS}

Predict the following markets.
1) 1X2: "oneXtwo": {"pick":"HOME"|"DRAW"|"AWAY","prob":0~1}
2) Handicap: home line {LINE} … "handicap": {"pick":"HOME"|"AWAY","prob":0~1}
3) Over/Under: total line {OU} (home+away goals > {OU} means OVER)
   "ou": {"pick":"OVER"|"UNDER","prob":0~1}
"reason": one-sentence justification
Answer with JSON containing only the requested keys.`;

export default async function MethodPage() {
  const d = await getBenchmarkData();
  const llmCompliance = d.compliance.filter((c) => c.model !== "scorebase");
  const g = d.gate;
  const allAcc = g.allN ? g.allHit / g.allN : 0;
  const pubAcc = g.publishedN ? g.publishedHit / g.publishedN : 0;
  const inflation = (pubAcc - allAcc) * 100;
  const hidden = g.allN - g.publishedN;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/en/benchmark" className="text-[13px] font-semibold text-rose-600 hover:underline dark:text-rose-400">
        ← Back to the benchmark
      </Link>
      <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-zinc-950 dark:text-white sm:text-[2.4rem]">
        Method
      </h1>
      <p className="mt-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60 sm:text-base">
        Everything below is written so you can attack the result. Where a design choice makes our
        numbers look better than they should, we say so and quantify it.
      </p>

      <H2 id="claim">The one claim</H2>
      <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Every forecast in this benchmark was written to a database before its event started, and
        scored afterwards against the official result. That is the whole claim. It means no model
        could have memorised the answer during training, because the answer did not exist yet. We
        make no claim that these models were prompted optimally, or that sports is a good proxy for
        reasoning in general.
      </p>

      <H2 id="pipeline">How a forecast is produced</H2>
      <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        A scheduled job assembles a fact sheet for each upcoming fixture from our own database —
        recent form, table position, head-to-head record, and sport-specific figures such as
        starting pitchers. Every model on the panel then receives{" "}
        <strong className="text-zinc-900 dark:text-white">the identical system and user message</strong>{" "}
        and returns JSON. Calls go through an OpenAI-compatible chat completions interface, with JSON
        mode enabled where the provider supports it. Temperature is not set, so each provider&rsquo;s
        default applies — that is a real inconsistency between models and we have not controlled for it.
      </p>

      <H2 id="prompt">The prompt, verbatim</H2>
      <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        The production prompt is Korean. Here it is unedited, followed by a faithful English
        translation.
      </p>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-white/45">
        System message — original
      </p>
      <Code>{SYSTEM_KO}</Code>
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-white/45">
        System message — English translation
      </p>
      <Code>{SYSTEM_EN}</Code>
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-white/45">
        User message — shape (translated; markets 2 and 3 appear only when a line exists)
      </p>
      <Code>{USER_TEMPLATE}</Code>

      <Warn title="The prompt tells the models to be conservative. Read the calibration result with that in mind.">
        <p>
          The system message instructs models to keep probabilities in the 0.50–0.58 range when
          evidence is thin, and to exceed 0.70 only with a clear numerical edge. So the clustering of
          forecasts in the fifties is partly induced by us, not a free choice by the model.
        </p>
        <p>
          This matters for how you read the headline. The overconfidence we measure is largely what
          happens <em>when a model overrides that instruction</em>. It is not evidence about how these
          models would behave under a neutral prompt, and we have not run one.
        </p>
      </Warn>

      <H2 id="compliance">How often each model ignored the ceiling</H2>
      <p className="mb-5 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Since the instruction is explicit, compliance is measurable: the share of 1X2 forecasts where
        the model stated a probability above 0.70.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-500 dark:border-white/10 dark:text-white/45">
              <th className="py-2.5 pr-3 font-semibold">Model</th>
              <th className="py-2.5 px-3 text-right font-semibold">Stated &gt; 0.70</th>
              <th className="py-2.5 px-3 text-right font-semibold">Mean stated</th>
              <th className="py-2.5 pl-3 text-right font-semibold">n</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {llmCompliance.map((c) => (
              <tr key={c.model} className="border-b border-zinc-100 dark:border-white/5">
                <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-white">{label(c.model)}</td>
                <td className={`py-2.5 px-3 text-right font-semibold ${c.over70 / c.n > 0.25 ? "text-rose-600 dark:text-rose-400" : "text-zinc-700 dark:text-white/70"}`}>
                  {pct(c.over70 / c.n)}
                </td>
                <td className="py-2.5 px-3 text-right text-zinc-700 dark:text-white/70">{c.avgProb.toFixed(3)}</td>
                <td className="py-2.5 pl-3 text-right text-zinc-500 dark:text-white/45">
                  {c.n.toLocaleString("en-GB")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[14px] leading-relaxed text-zinc-600 dark:text-white/60">
        The two models that most often break the ceiling are also the two with the largest calibration
        error on the main page. Below those two the relationship gets noisy — Gemini stays under the
        ceiling almost always and is still middling on ECE — so treat this as a lead worth pulling,
        not a demonstrated mechanism.
      </p>

      <H2 id="inputs">What the models can and cannot see</H2>
      <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        They see the assembled fact sheet and nothing else. They are told explicitly not to invent
        injuries, line-ups, or news that was not supplied. Most importantly for the market comparison
        on the main page,{" "}
        <strong className="text-zinc-900 dark:text-white">no odds are included in the prompt</strong> —
        the market control is therefore an independent forecaster, not something leaking into the
        models&rsquo; input. We cannot rule out that a model recognises a fixture from its own training
        data and recalls background knowledge about the teams; we can only guarantee it does not know
        the result.
      </p>

      <H2 id="scoring">Scoring</H2>
      <div className="space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        <p>
          <strong className="text-zinc-900 dark:text-white">1X2.</strong> Correct when the picked side
          matches the final result. Draws are only an allowed pick in sports that have them, so
          baseball and basketball are effectively two-way.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">Handicap and Over/Under.</strong> Both
          scored against a single line, and{" "}
          <strong className="text-zinc-900 dark:text-white">every model is given the same line</strong>{" "}
          for a fixture, so no model gets an easier target. The line is stored with the forecast and
          appears in the downloadable data.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">The market control.</strong> Bookmaker
          prices for the same fixture, converted to implied probability, with the highest-probability
          outcome taken as the market&rsquo;s pick and scored identically. The vig is not removed
          before picking the maximum, which does not change which outcome is largest.
        </p>
        <p>
          Results are read from official league feeds after the event finishes. A forecast stays
          unscored until the event reaches a final state, and postponed fixtures are never scored —
          all {d.scored.toLocaleString("en-GB")} scored rows sit on completed events.
        </p>
      </div>

      <H2 id="exclusions">Inclusions and exclusions</H2>
      <div className="space-y-4 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        <p>
          <strong className="text-zinc-900 dark:text-white">Excluded — forecasts written after
          kick-off.</strong> On our first day of operation, {d.excluded} rows were seeded for events
          that had already started. They are filtered at read time rather than deleted, so the audit
          trail survives. It has not recurred since.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">Included — unscored-by-the-product
          picks.</strong> See the box below. This is the exclusion we refuse to make.
        </p>
      </div>

      <Warn title="Our product hides some picks from users. The benchmark keeps them, on purpose.">
        <p>
          Backtests showed certain pick types underperform, so a gate stops them from being displayed
          on the consumer scorecard. Those forecasts are still stored and still scored — and the
          benchmark counts every one of them.
        </p>
        <p>
          Applying the product filter would remove {hidden.toLocaleString("en-GB")} of{" "}
          {g.allN.toLocaleString("en-GB")} scored forecasts and lift overall accuracy from{" "}
          <strong>{pct(allAcc, 2)}</strong> to <strong>{pct(pubAcc, 2)}</strong> — about{" "}
          {inflation.toFixed(1)} points, and considerably more for some model-market pairs. That
          number would be measuring our filter, not the models. So the benchmark does not apply it,
          and the figures here will not match the consumer scorecard.
        </p>
      </Warn>

      <H2 id="limits">Known limitations</H2>
      <ul className="space-y-3 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">The panel changed over time.</strong>{" "}
            Models joined on different dates, so coverage runs from{" "}
            {Math.min(...llmCompliance.map((c) => c.n)).toLocaleString("en-GB")} to{" "}
            {Math.max(...llmCompliance.map((c) => c.n)).toLocaleString("en-GB")} forecasts and the
            event mixes are not identical. Cross-model accuracy comparisons are confounded by this,
            which is a second reason not to rank them. The paired test against the market is immune,
            because it compares each model with the market on that model&rsquo;s own fixtures.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">The prompt is Korean.</strong> Model
            performance can vary with prompt language, and we have not run an English control. Any
            model disadvantaged by Korean is disadvantaged here.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">One prompt, never varied.</strong> There
            is no prompt-sensitivity analysis. A different phrasing could move these numbers and we do
            not know by how much.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">Temperature is uncontrolled.</strong>{" "}
            Each provider&rsquo;s default is used, so sampling behaviour is not held constant across
            models.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">The sport mix is lopsided.</strong>{" "}
            Baseball dominates the sample. Baseball has a high base rate for the stronger side and no
            draw, so it flatters any forecaster that simply picks the favourite.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">The window is short.</strong> This
            covers {d.from} to {d.to}. Sports have seasons, and two months is not a season.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
          <span>
            <strong className="text-zinc-900 dark:text-white">We build one of the entrants.</strong>{" "}
            The Scorebase Elo model is ours. It is labelled as a control, it loses to the market on a
            paired test, and its result is reported the same way as everyone else&rsquo;s — but you
            should weigh it knowing who wrote it.
          </span>
        </li>
      </ul>

      <H2 id="data">Check it yourself</H2>
      <p className="text-[15px] leading-relaxed text-zinc-600 dark:text-white/60">
        Every scored forecast is downloadable as{" "}
        <a href="/en/benchmark/data.csv" className="font-semibold text-rose-600 hover:underline dark:text-rose-400">CSV</a>{" "}
        or{" "}
        <a href="/en/benchmark/data.json" className="font-semibold text-rose-600 hover:underline dark:text-rose-400">JSON</a>,
        under {BENCHMARK_LICENSE}, including the bookmaker probabilities needed to rebuild the market
        control. If you recompute something and get a different answer, we want to hear about it.
      </p>
    </div>
  );
}
