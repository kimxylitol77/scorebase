// /live-scores/{league} — 리그별 라이브 스코어. "Premier League live scores" 류 롱테일 타깃. ISR 60s.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchLiveBoard } from "@/lib/sp/live";
import { leagueBySlug, SP_LEAGUES } from "@/lib/sp/leagues";
import { SP_URL, spUrl } from "@/lib/sp/site";
import { jsonLdScript } from "@/lib/seo/jsonld";
import LiveBoardView from "@/components/sp/LiveBoardView";

export const revalidate = 60;

type Params = { league: string };

export function generateStaticParams(): Params[] {
  return SP_LEAGUES.map((l) => ({ league: l.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { league } = await params;
  const lg = leagueBySlug(league);
  if (!lg) return {};
  return {
    title: `${lg.name} Live Scores — Today's Results, Fixtures & Model Picks`,
    description: `${lg.name} live scores updated every minute, with today's fixtures, the latest results and the model's pre-match pick for every game.`,
    alternates: { canonical: spUrl(`/live-scores/${lg.slug}`) },
  };
}

const SPORT_NOTE: Record<string, string> = {
  football: "Football rows show the match minute while play is on, HT at half-time and FT once the referee blows for full time. Scores exclude penalty shoot-outs.",
  basketball: "Basketball scores update through all four quarters and overtime. There is no draw, so the pick is always one of the two teams.",
  baseball: "Baseball rows show the current inning while play is on. Postponed games stay listed as PPD until they are rescheduled.",
  hockey: "Hockey scores update through three periods, overtime and shoot-outs. Shoot-out winners are credited with the win.",
};

export default async function LeagueLiveScores({ params }: { params: Promise<Params> }) {
  const { league } = await params;
  const lg = leagueBySlug(league);
  if (!lg) notFound();
  const board = await fetchLiveBoard({ league: lg.code });
  const faq: [string, string][] = [
    [`How often are ${lg.name} live scores updated?`, "Every minute while a match is in play. Finished games move to the results list within a minute of the final whistle."],
    [`Where are the ${lg.name} predictions?`, `Every row links to the match page with the model's win probabilities. The league overview with the coming week's fixtures is at /${lg.slug}.`],
    ["What time zone are kick-offs shown in?", "Your device's local time. The page detects it automatically."],
  ];
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: `${lg.name} live scores`, url: spUrl(`/live-scores/${lg.slug}`), isPartOf: { "@id": `${SP_URL}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Live scores", item: spUrl("/live-scores") },
        { "@type": "ListItem", position: 2, name: `${lg.name} live scores`, item: spUrl(`/live-scores/${lg.slug}`) },
      ] },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      ...[...board.live, ...board.upcoming].slice(0, 20).map((m) => ({
        "@type": "SportsEvent", name: `${m.home.name} vs ${m.away.name}`, startDate: m.startTime, url: spUrl(`/match/${m.id}`),
        homeTeam: { "@type": "SportsTeam", name: m.home.name }, awayTeam: { "@type": "SportsTeam", name: m.away.name },
        eventStatus: m.status === "POSTPONED" ? "https://schema.org/EventPostponed" : "https://schema.org/EventScheduled",
      })),
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <nav className="pt-6 text-xs" style={{ color: "var(--sp-fg-dim)" }} aria-label="Breadcrumb"><Link href="/live-scores" className="hover:underline">Live scores</Link> / {lg.name}</nav>
      <section className="py-8">
        <nav aria-label="Leagues" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
          <Link href="/live-scores" className="sp-chip">All</Link>
          {SP_LEAGUES.map((l) => <Link key={l.code} href={`/live-scores/${l.slug}`} className={`sp-chip ${l.code === lg.code ? "sp-chip-active" : ""}`}>{l.short}</Link>)}
        </nav>
        <p className="sp-eyebrow mt-8">{lg.sport} · live scores</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">{lg.name} live scores</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>{lg.name} matches in play, today&apos;s fixtures and the latest results, updated every minute. {SPORT_NOTE[lg.sport]} Predictions for the coming week are on the <Link href={`/${lg.slug}`} className="underline">{lg.name} predictions page</Link>.</p>
      </section>
      <LiveBoardView board={board} grouped={false} />
      <section className="mt-14">
        <h2 className="mb-4 text-2xl font-extrabold">{lg.name} live scores — questions</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {faq.map(([q, a]) => (
            <div key={q} className="sp-card p-5"><h3 className="text-base font-bold">{q}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>{a}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}
