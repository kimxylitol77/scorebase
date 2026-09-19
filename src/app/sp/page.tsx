// sportspredictions.live 홈 — 히어로 · 다가오는 경기 · 강한 픽 · 리그 칩 · 통계 · 정직한 적중률.
import type { Metadata } from "next";
import Link from "next/link";
import { fetchLeagueAccuracy, fetchRecentGraded, fetchUpcoming } from "@/lib/sp/data";
import { SP_LEAGUES } from "@/lib/sp/leagues";
import { SP_NAME, SP_URL, spUrl } from "@/lib/sp/site";
import { jsonLdScript } from "@/lib/seo/jsonld";
import MatchCard from "@/components/sp/MatchCard";
import LeagueChips from "@/components/sp/LeagueChips";

export const revalidate = 600;

export const metadata: Metadata = {
  alternates: { canonical: spUrl("/") },
  openGraph: { url: SP_URL, title: `${SP_NAME} — Free AI Sports Predictions`, description: "Calibrated win probabilities for today's football, baseball, basketball and hockey fixtures. Every pick graded in public." },
};

const LD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", "@id": `${SP_URL}/#website`, url: SP_URL, name: SP_NAME, inLanguage: "en", publisher: { "@id": `${SP_URL}/#org` } },
    { "@type": "Organization", "@id": `${SP_URL}/#org`, name: SP_NAME, url: SP_URL, parentOrganization: { "@type": "Organization", name: "Scorebase", url: "https://www.scorebase.kr" } },
  ],
};

export default async function SpHome() {
  const [upcoming, graded, acc] = await Promise.all([fetchUpcoming({ hours: 48, take: 60 }), fetchRecentGraded({ take: 8 }), fetchLeagueAccuracy()]);
  const strong = upcoming.filter((m) => m.strong).slice(0, 6);
  const soon = upcoming.slice(0, 12);
  const evaluated = acc.reduce((a, x) => a + x.stat.oneXTwo.evaluated, 0);
  const correct = acc.reduce((a, x) => a + x.stat.oneXTwo.correct, 0);
  const overall = evaluated ? Math.round((correct / evaluated) * 100) : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(LD) }} />
      <section className="py-14 sm:py-20">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ borderColor: "var(--sp-lime-line)", background: "var(--sp-lime-soft)", color: "var(--sp-lime)" }}>
          <span className="sp-live-dot" aria-hidden /> AI models active
        </div>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          AI Sports Predictions —<br />
          <span style={{ color: "var(--sp-lime)" }}>calibrated</span> win probabilities, graded in public.
        </h1>
        <p className="mt-5 max-w-2xl text-lg" style={{ color: "var(--sp-fg-muted)" }}>
          Free match predictions for {SP_LEAGUES.length} leagues across football, baseball, basketball and hockey. Every pick is timestamped before kick-off and scored on the result.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#today" className="sp-btn sp-btn-primary">See today&apos;s picks</a>
          <Link href="/methodology" className="sp-btn sp-btn-ghost">How it works</Link>
        </div>
      </section>

      <section id="today" className="scroll-mt-20">
        <LeagueChips />
        <div className="mt-6 mb-4 flex items-end justify-between">
          <div>
            <p className="sp-eyebrow">Coming up</p>
            <h2 className="mt-1 text-2xl font-extrabold">Next 48 hours</h2>
          </div>
          <span className="sp-mono text-sm" style={{ color: "var(--sp-fg-muted)" }}>{upcoming.length} fixtures</span>
        </div>
        {soon.length === 0 ? (
          <p className="sp-card p-6 text-sm" style={{ color: "var(--sp-fg-muted)" }}>No fixtures with predictions in the next 48 hours. Check back after the next update.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{soon.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
      </section>

      {strong.length > 0 && (
        <section className="mt-14">
          <p className="sp-eyebrow">Top predictions</p>
          <h2 className="mt-1 mb-4 text-2xl font-extrabold">Strong picks</h2>
          <p className="mb-4 max-w-2xl text-sm" style={{ color: "var(--sp-fg-muted)" }}>Fixtures where the model&apos;s top outcome clears the league&apos;s strong-pick threshold. Historical hit rate for these is on the accuracy page.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{strong.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </section>
      )}

      <section className="mt-14 grid gap-3 sm:grid-cols-3">
        {[
          [String(SP_LEAGUES.length), "Leagues covered"],
          ["Daily", "Predictions refreshed"],
          ["Free", "No sign-up required"],
        ].map(([v, l]) => (
          <div key={l} className="sp-card p-6 text-center">
            <div className="sp-display text-3xl font-extrabold" style={{ color: "var(--sp-lime)" }}>{v}</div>
            <div className="sp-eyebrow mt-2">{l}</div>
          </div>
        ))}
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="sp-card p-6 sm:p-8">
          <p className="sp-eyebrow">Honest accuracy tracking</p>
          <h2 className="mt-1 text-2xl font-extrabold">A 50/50 match stays 50/50.</h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>
            We do not inflate confidence. Probabilities come from Elo ratings with margin-of-victory, a Dixon-Coles goal model for football and a blend with market-implied odds. The top pick in a lopsided fixture may reach 75%. A tight derby will sit near 40%. Both are shown as they are.
          </p>
          {overall != null && (
            <p className="sp-mono mt-5 text-sm">
              <span className="text-3xl font-bold" style={{ color: "var(--sp-lime)" }}>{overall}%</span>
              <span style={{ color: "var(--sp-fg-muted)" }}> match-winner accuracy over {evaluated.toLocaleString("en-GB")} graded fixtures</span>
            </p>
          )}
          <Link href="/accuracy" className="sp-btn sp-btn-ghost mt-6">Open the accuracy report</Link>
        </div>
        <div>
          <p className="sp-eyebrow mb-3">Recently graded</p>
          <div className="grid gap-2">{graded.slice(0, 5).map((m) => <MatchCard key={m.id} m={m} compact />)}</div>
        </div>
      </section>
    </>
  );
}
