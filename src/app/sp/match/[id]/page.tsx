// /match/[id] — 한 경기의 예측 근거: 1X2 확률·시장 대비 갭·O/U·핸디캡·AI 패널 픽·결과.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import TeamBadge from "@/components/TeamBadge";
import { fetchMatch, fetchPanelPicks, type PanelPick } from "@/lib/sp/data";
import { leagueByCode } from "@/lib/sp/leagues";
import { SCOREBASE_EN, SP_URL, spUrl } from "@/lib/sp/site";
import { jsonLdScript } from "@/lib/seo/jsonld";
import LocalTime from "@/components/sp/LocalTime";
import ProbBar from "@/components/sp/ProbBar";
import { pickLabel } from "@/components/sp/MatchCard";

export const revalidate = 300;

type Params = { id: string };
const pct = (p: number) => `${Math.round(p * 100)}%`;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const m = await fetchMatch(Number(id));
  if (!m) return {};
  const lg = leagueByCode(m.league);
  return {
    title: `${m.home.name} vs ${m.away.name} Prediction — ${lg?.name ?? m.league}`,
    description: m.probs
      ? `AI prediction: ${m.home.name} ${pct(m.probs.home)}${m.probs.draw != null ? `, draw ${pct(m.probs.draw)}` : ""}, ${m.away.name} ${pct(m.probs.away)}. Pick: ${pickLabel(m)}.`
      : `AI prediction for ${m.home.name} vs ${m.away.name}.`,
    alternates: { canonical: spUrl(`/match/${m.id}`) },
  };
}

function panelPickText(p: PanelPick, home: string, away: string): string {
  if (p.market === "OU") return `${p.pick === "OVER" ? "Over" : "Under"}${p.line != null ? ` ${p.line}` : ""}`;
  if (p.market === "HANDICAP") return `${p.pick === "HOME" ? home : away}${p.line != null ? ` ${p.pick === "HOME" ? "-" : "+"}${Math.abs(p.line)}` : ""}`;
  return p.pick === "HOME" ? home : p.pick === "AWAY" ? away : "Draw";
}

export default async function MatchPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const m = await fetchMatch(Number(id));
  if (!m) notFound();
  const panel = await fetchPanelPicks(m.id);
  const lg = leagueByCode(m.league);
  const finished = m.status === "FINISHED" && m.homeScore != null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${m.home.name} vs ${m.away.name}`,
    startDate: m.startTime,
    eventStatus: finished ? "https://schema.org/EventScheduled" : "https://schema.org/EventScheduled",
    homeTeam: { "@type": "SportsTeam", name: m.home.name },
    awayTeam: { "@type": "SportsTeam", name: m.away.name },
    url: spUrl(`/match/${m.id}`),
    organizer: { "@type": "Organization", name: lg?.name ?? m.league },
    publisher: { "@type": "Organization", name: "Sports Predictions", url: SP_URL },
  };
  const markets: PanelPick["market"][] = ["1X2", "HANDICAP", "OU"];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <nav className="pt-6 text-xs" style={{ color: "var(--sp-fg-dim)" }} aria-label="Breadcrumb">
        <Link href="/" className="hover:underline">Predictions</Link> / {lg ? <Link href={`/${lg.slug}`} className="hover:underline">{lg.name}</Link> : m.league}
      </nav>
      <section className="py-8">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--sp-fg-muted)" }}>
          <span className="font-bold uppercase tracking-wide">{lg?.name ?? m.league}</span>
          <span aria-hidden>·</span>
          <LocalTime iso={m.startTime} />
          {!finished && <LocalTime iso={m.startTime} mode="startsIn" className="sp-mono font-bold" />}
        </div>
        <h1 className="flex flex-wrap items-center gap-3 text-3xl font-extrabold sm:text-5xl">
          <span className="flex items-center gap-3"><TeamBadge logoUrl={m.home.logo} size={40} className="rounded-md bg-white/90" />{m.home.name}</span>
          <span className="text-xl font-normal" style={{ color: "var(--sp-fg-dim)" }}>vs</span>
          <span className="flex items-center gap-3"><TeamBadge logoUrl={m.away.logo} size={40} className="rounded-md bg-white/90" />{m.away.name}</span>
        </h1>
        {finished && (
          <p className="sp-mono mt-4 text-2xl font-bold">
            Final {m.homeScore}-{m.awayScore}
            {m.correct != null && <span className="ml-3 text-base" style={{ color: m.correct ? "var(--sp-green)" : "var(--sp-red)" }}>{m.correct ? "Prediction hit" : "Prediction missed"}</span>}
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={`sp-card p-6 ${m.strong && !finished ? "sp-card-accent" : ""}`}>
          <p className="sp-eyebrow">Scorebase model · match winner</p>
          {m.probs ? (
            <>
              <div className="mt-4"><ProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} homeLabel={m.home.name} awayLabel={m.away.name} size="lg" /></div>
              <p className="mt-5 text-lg">Pick <strong>{pickLabel(m)}</strong> <span className="sp-mono font-bold" style={{ color: m.strong ? "var(--sp-lime)" : "var(--sp-fg)" }}>{pct(m.pickProb ?? 0)}</span>{m.strong && <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--sp-lime-soft)", color: "var(--sp-lime)" }}>Strong pick</span>}</p>
            </>
          ) : (
            <p className="mt-3 text-sm" style={{ color: "var(--sp-fg-muted)" }}>No model probability for this fixture yet.</p>
          )}
          {m.market && (
            <div className="mt-6 border-t pt-4 text-sm" style={{ borderColor: "var(--sp-border)" }}>
              <p className="sp-eyebrow mb-2">Market-implied (vig removed)</p>
              <p className="sp-mono" style={{ color: "var(--sp-fg-muted)" }}>
                {m.home.name} {pct(m.market.home)}{m.market.draw != null ? ` · Draw ${pct(m.market.draw)}` : ""} · {m.away.name} {pct(m.market.away)}
                {m.valueGap != null && <span className="ml-2" style={{ color: m.valueGap > 0 ? "var(--sp-green)" : "var(--sp-fg-dim)" }}>(model {m.valueGap > 0 ? "+" : ""}{Math.round(m.valueGap * 100)} pts vs market)</span>}
              </p>
            </div>
          )}
        </div>
        <div className="grid gap-4">
          {m.over && (
            <div className="sp-card p-5">
              <p className="sp-eyebrow">Total goals 2.5</p>
              <p className="mt-2 text-lg font-bold">{m.over.pick === "OVER" ? "Over" : "Under"} 2.5 <span className="sp-mono" style={{ color: "var(--sp-fg-muted)" }}>{pct(m.over.pick === "OVER" ? m.over.prob : 1 - m.over.prob)}</span></p>
            </div>
          )}
          {m.handicap && (
            <div className="sp-card p-5">
              <p className="sp-eyebrow">Handicap</p>
              <p className="mt-2 text-lg font-bold">{m.handicap.pick === "HOME" ? m.home.name : m.away.name} {m.handicap.pick === "HOME" ? "-" : "+"}{Math.abs(m.handicap.line)} <span className="sp-mono" style={{ color: "var(--sp-fg-muted)" }}>{pct(m.handicap.prob)}</span></p>
            </div>
          )}
          <div className="sp-card p-5 text-sm">
            <p className="sp-eyebrow mb-2">Go deeper on Scorebase</p>
            <div className="flex flex-col gap-1">
              <a className="underline" href={`${SCOREBASE_EN}/teams/${m.home.id}`}>{m.home.name} team page</a>
              <a className="underline" href={`${SCOREBASE_EN}/teams/${m.away.id}`}>{m.away.name} team page</a>
              {lg && <a className="underline" href={`${SCOREBASE_EN}/predictions/${lg.code}`}>{lg.name} season projections</a>}
            </div>
          </div>
        </div>
      </section>

      {panel.length > 0 && (
        <section className="mt-10">
          <p className="sp-eyebrow">AI panel</p>
          <h2 className="mt-1 mb-4 text-2xl font-extrabold">What each model picked</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {markets.map((mk) => {
              const rows = panel.filter((p) => p.market === mk);
              if (!rows.length) return null;
              return (
                <div key={mk} className="sp-card p-5">
                  <p className="sp-eyebrow mb-3">{mk === "1X2" ? "Match winner" : mk === "OU" ? "Over / under" : "Handicap"}</p>
                  <ul className="grid gap-2 text-sm">
                    {rows.map((p) => (
                      <li key={p.model} className="flex items-center justify-between gap-2">
                        <span style={{ color: "var(--sp-fg-muted)" }}>{p.label}</span>
                        <span className="sp-mono font-bold">
                          {panelPickText(p, m.home.name, m.away.name)} {pct(p.prob)}
                          {p.correct != null && <span className="ml-1" style={{ color: p.correct ? "var(--sp-green)" : "var(--sp-red)" }}>{p.correct ? "✓" : "✗"}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
