// /{league-slug} — 리그별 예측 목록 + 최근 채점 + 적중률. 알 수 없는 슬러그·깊은 경로는 sp 404.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchRecentGraded, fetchUpcoming } from "@/lib/sp/data";
import { statForLeague } from "@/lib/predict/accuracy-stats";
import { leagueBySlug, SP_LEAGUES } from "@/lib/sp/leagues";
import { SCOREBASE_EN, spUrl } from "@/lib/sp/site";
import MatchCard from "@/components/sp/MatchCard";
import LeagueChips from "@/components/sp/LeagueChips";

export const revalidate = 600;

type Params = { slug: string[] };

export function generateStaticParams(): Params[] {
  return SP_LEAGUES.map((l) => ({ slug: [l.slug] }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const lg = slug.length === 1 ? leagueBySlug(slug[0]) : undefined;
  if (!lg) return {};
  return {
    title: `${lg.name} Predictions — Win Probabilities & Picks`,
    description: `Free AI predictions for upcoming ${lg.name} fixtures: win probabilities, model picks and a public accuracy record.`,
    alternates: { canonical: spUrl(`/${lg.slug}`) },
  };
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

export default async function LeaguePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const lg = slug.length === 1 ? leagueBySlug(slug[0]) : undefined;
  if (!lg) notFound();
  const [upcoming, graded, stat] = await Promise.all([
    fetchUpcoming({ league: lg.code, hours: 24 * 7, take: 40 }),
    fetchRecentGraded({ league: lg.code, take: 6 }),
    statForLeague(lg.code),
  ]);
  const cells = [
    ["All-time", stat.oneXTwo],
    ["Last 30 days", stat.rolling30],
    ["Strong picks", stat.strong],
  ] as const;
  return (
    <>
      <section className="py-10">
        <LeagueChips active={lg.code} />
        <p className="sp-eyebrow mt-8">{lg.sport}</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">{lg.name} predictions</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>Upcoming {lg.name} fixtures with model win probabilities. Standings, form and full analysis live on <a className="underline" href={`${SCOREBASE_EN}/predictions/${lg.code}`} target="_blank" rel="noopener noreferrer">Scorebase</a>.</p>
      </section>
      <section className="mb-10 grid gap-3 sm:grid-cols-3">
        {cells.map(([label, r]) => (
          <div key={label} className="sp-card p-5">
            <div className="sp-eyebrow">{label}</div>
            <div className="sp-mono mt-2 text-2xl font-bold">{r.evaluated ? pct(r.rate) : "—"}</div>
            <div className="text-xs" style={{ color: "var(--sp-fg-dim)" }}>{r.correct}/{r.evaluated} match-winner picks</div>
          </div>
        ))}
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-extrabold">Next 7 days</h2>
        {upcoming.length === 0 ? (
          <p className="sp-card p-6 text-sm" style={{ color: "var(--sp-fg-muted)" }}>No {lg.name} fixtures with predictions in the next 7 days.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        )}
      </section>
      {graded.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-extrabold">Recently graded</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{graded.map((m) => <MatchCard key={m.id} m={m} compact />)}</div>
        </section>
      )}
    </>
  );
}
