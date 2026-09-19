// sportspredictions.live 홈 = 키워드 랜딩페이지. 오늘의 핵심 경기(최대 5)만 노출하고, 나머지는 /today.
// 검색 의도별 섹션(football predictions today · NBA/MLB/NHL · win probability · accuracy · FAQ)으로 구성.
import type { Metadata } from "next";
import Link from "next/link";
import { fetchKeyMatches, fetchLeagueAccuracy, fetchRecentGraded, KEY_MATCH_LIMIT } from "@/lib/sp/data";
import { SP_LEAGUES } from "@/lib/sp/leagues";
import { SP_NAME, SP_URL, spUrl } from "@/lib/sp/site";
import { jsonLdScript } from "@/lib/seo/jsonld";
import MatchCard from "@/components/sp/MatchCard";

export const revalidate = 600;

const TITLE = "AI Sports Predictions Today — Free Football, NBA, MLB & NHL Win Probabilities";
const DESC =
  "Free AI sports predictions for today's key matches: Premier League, Champions League, LaLiga, Bundesliga, NBA, MLB and NHL win probabilities, graded in public. No sign-up, no betting tips.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: spUrl("/") },
  openGraph: { url: SP_URL, title: TITLE, description: DESC },
};

const FAQ: [string, string][] = [
  ["What is an AI sports prediction?", "A probability for each outcome of a match, produced by a statistical model rather than a pundit. On this site the model combines Elo team ratings with margin of victory, a Dixon-Coles goal model for football and market-implied odds with the bookmaker margin removed."],
  ["How accurate are the predictions?", "It depends on the league. Match-winner accuracy across graded fixtures is published on the accuracy page and updated as results come in. A 55% hit rate in football is normal because draws are hard to call. We show the real number, not a marketing one."],
  ["Which sports and leagues are covered?", "Football (Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, MLS, K League 1), basketball (NBA), baseball (MLB, KBO, NPB) and ice hockey (NHL)."],
  ["Why only a few matches per day?", "We publish the handful of fixtures where the model, the market and the AI panel all have something to say. Bulk-generated pages for every kick-off add noise and nothing else. Every other fixture is still listed on the today page."],
  ["Is this a betting tips service?", "No. There are no tips, no VIP plans and no bonus offers. Probabilities are shown so you can judge a match for yourself. A prediction can be wrong on any single game."],
  ["Do I need an account?", "No. Everything on the site is free and open, including the full accuracy record."],
];

const pct = (r: number) => `${Math.round(r * 100)}%`;

export default async function SpHome() {
  const [key, graded, acc] = await Promise.all([fetchKeyMatches(), fetchRecentGraded({ take: 4 }), fetchLeagueAccuracy()]);
  const evaluated = acc.reduce((a, x) => a + x.stat.oneXTwo.evaluated, 0);
  const correct = acc.reduce((a, x) => a + x.stat.oneXTwo.correct, 0);
  const overall = evaluated ? correct / evaluated : null;
  const football = SP_LEAGUES.filter((l) => l.sport === "football");
  const us = SP_LEAGUES.filter((l) => l.sport !== "football");
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${SP_URL}/#website`, url: SP_URL, name: SP_NAME, inLanguage: "en", publisher: { "@id": `${SP_URL}/#org` } },
      { "@type": "Organization", "@id": `${SP_URL}/#org`, name: SP_NAME, url: SP_URL, parentOrganization: { "@type": "Organization", name: "Scorebase", url: "https://www.scorebase.kr" } },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />

      <section className="py-14 sm:py-20">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--sp-lime-line)", background: "var(--sp-lime-soft)", color: "var(--sp-lime)" }}>
          <span className="sp-live-dot" aria-hidden /> Updated daily · free · no sign-up
        </div>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          AI sports predictions for <span style={{ color: "var(--sp-lime)" }}>today&apos;s key matches</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg" style={{ color: "var(--sp-fg-muted)" }}>
          Win probabilities for football, NBA, MLB and NHL from a calibrated statistical model, checked against the market and a panel of AI models. Every pick is timestamped before kick-off and graded on the result.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#key" className="sp-btn sp-btn-primary">Today&apos;s key matches</a>
          <Link href="/accuracy" className="sp-btn sp-btn-ghost">See the accuracy record</Link>
        </div>
      </section>

      <section id="key" className="scroll-mt-20">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="sp-eyebrow">Today&apos;s key matches</p>
            <h2 className="mt-1 text-2xl font-extrabold">The {KEY_MATCH_LIMIT} fixtures worth your attention</h2>
          </div>
          <Link href="/today" className="text-sm font-semibold hover:underline" style={{ color: "var(--sp-fg-muted)" }}>All fixtures →</Link>
        </div>
        {key.length === 0 ? (
          <p className="sp-card p-6 text-sm" style={{ color: "var(--sp-fg-muted)" }}>No key matches in the next 24 hours. The full fixture list is on the <Link href="/today" className="underline">today page</Link>.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{key.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
        <p className="mt-3 text-xs" style={{ color: "var(--sp-fg-dim)" }}>Selected automatically: big-league fixtures first, then strong model picks, AI-panel coverage and market data. At most {KEY_MATCH_LIMIT} per day.</p>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-2">
        <div className="sp-card p-6 sm:p-8">
          <p className="sp-eyebrow">Football predictions today</p>
          <h2 className="mt-1 text-2xl font-extrabold">Premier League, Champions League, LaLiga and more</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>
            Football predictions come with three-way probabilities (home, draw, away), an over/under 2.5 goals lean and a handicap line. Each league page lists the coming week&apos;s fixtures with the model&apos;s recent hit rate for that competition.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {football.map((l) => <Link key={l.code} href={`/${l.slug}`} className="sp-chip">{l.name} predictions</Link>)}
          </div>
        </div>
        <div className="sp-card p-6 sm:p-8">
          <p className="sp-eyebrow">NBA · MLB · NHL predictions</p>
          <h2 className="mt-1 text-2xl font-extrabold">Two-way win probabilities for US leagues</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>
            Basketball, baseball and hockey have no draw, so the prediction is a single win probability per side. Baseball uses a Poisson runs model with the listed starters; basketball and hockey use Elo win expectancy with home advantage.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {us.map((l) => <Link key={l.code} href={`/${l.slug}`} className="sp-chip">{l.name} predictions</Link>)}
          </div>
        </div>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="sp-card p-6 sm:p-8">
          <p className="sp-eyebrow">Win probability, explained</p>
          <h2 className="mt-1 text-2xl font-extrabold">A 50/50 match stays 50/50.</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>
            Most prediction sites show 85% or 90% confidence on single picks. The maths does not support that. A clear favourite in the Premier League wins roughly two matches in three, and a tight derby is close to a coin flip once the draw is counted. Our probabilities are calibrated to the real variance of each sport, and the calibration is checked on the accuracy page. When the model disagrees with the bookmaker market we show both numbers and the gap, so you can see where the edge is supposed to be.
          </p>
          {overall != null && (
            <p className="sp-mono mt-5 text-sm">
              <span className="text-3xl font-bold" style={{ color: "var(--sp-lime)" }}>{pct(overall)}</span>
              <span style={{ color: "var(--sp-fg-muted)" }}> match-winner accuracy over {evaluated.toLocaleString("en-GB")} graded fixtures</span>
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/accuracy" className="sp-btn sp-btn-ghost">Accuracy report</Link>
            <Link href="/methodology" className="sp-btn sp-btn-ghost">How it works</Link>
          </div>
        </div>
        <div>
          <p className="sp-eyebrow mb-3">Recently graded</p>
          <div className="grid gap-2">{graded.map((m) => <MatchCard key={m.id} m={m} compact />)}</div>
        </div>
      </section>

      <section className="mt-16">
        <p className="sp-eyebrow">FAQ</p>
        <h2 className="mt-1 mb-5 text-2xl font-extrabold">Questions people ask about sports predictions</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q} className="sp-card p-5">
              <h3 className="text-base font-bold">{q}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>{a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
