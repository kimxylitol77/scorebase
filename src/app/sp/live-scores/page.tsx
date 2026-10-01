// /live-scores — 13개 리그 라이브 스코어 허브. 롱테일 "live scores" 키워드의 상위 페이지. ISR 60s.
import type { Metadata } from "next";
import Link from "next/link";
import { fetchLiveBoard } from "@/lib/sp/live";
import { SP_LEAGUES } from "@/lib/sp/leagues";
import { SP_URL, spUrl } from "@/lib/sp/site";
import { jsonLdScript } from "@/lib/seo/jsonld";
import LiveBoardView from "@/components/sp/LiveBoardView";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Live Scores Today — Football, NBA, MLB & NHL Results and Fixtures",
  description: "Live scores and results for Premier League, Champions League, LaLiga, Bundesliga, Serie A, NBA, MLB, NHL, KBO and more, with the model's pre-match pick on every game.",
  alternates: { canonical: spUrl("/live-scores") },
};

const FAQ: [string, string][] = [
  ["How often do the live scores update?", "Every minute while a match is in play. Football shows the match minute, baseball the inning."],
  ["Which competitions are covered?", "Premier League, Champions League, LaLiga, Bundesliga, Serie A, Ligue 1, MLS, K League 1, NBA, NHL, MLB, KBO and NPB."],
  ["What does the pick column mean?", "The outcome our model favoured before kick-off. After the final whistle it shows whether that pick hit or missed, so you can judge the model on every game."],
];

export default async function LiveScoresHub() {
  const board = await fetchLiveBoard();
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: "Live scores today", url: spUrl("/live-scores"), isPartOf: { "@id": `${SP_URL}/#website` } },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      { "@type": "ItemList", name: "Live scores by league", itemListElement: SP_LEAGUES.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: `${l.name} live scores`, url: spUrl(`/live-scores/${l.slug}`) })) },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <section className="py-10">
        <p className="sp-eyebrow">Live scores</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">Live scores today</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>Every match in play across 13 leagues, plus today&apos;s fixtures and the latest results. Each game carries the model&apos;s pre-match pick so you can see how the prediction held up.</p>
        <nav aria-label="Leagues" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]">
          {SP_LEAGUES.map((l) => <Link key={l.code} href={`/live-scores/${l.slug}`} className="sp-chip">{l.short} live scores</Link>)}
        </nav>
      </section>
      <LiveBoardView board={board} grouped />
      <section className="mt-14">
        <h2 className="mb-4 text-2xl font-extrabold">About these live scores</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FAQ.map(([q, a]) => (
            <div key={q} className="sp-card p-5"><h3 className="text-base font-bold">{q}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--sp-fg-muted)" }}>{a}</p></div>
          ))}
        </div>
      </section>
    </>
  );
}
