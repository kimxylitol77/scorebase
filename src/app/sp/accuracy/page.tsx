// /accuracy — 모델 리더보드(7모델) + 리그별 스코어베이스 모델 적중률. 숫자 출처 = src/lib/predict/*.
import type { Metadata } from "next";
import Link from "next/link";
import { fetchLeagueAccuracy, fetchModelLeaderboard } from "@/lib/sp/data";
import { leagueByCode } from "@/lib/sp/leagues";
import { SP_URL, spUrl } from "@/lib/sp/site";
import { EXCLUSION_NOTE_EN } from "@/lib/predict/scorecard-eligibility";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Accuracy Report — AI Model Leaderboard & League Hit Rates",
  description: "Public accuracy of every prediction: Scorebase model, GPT, Claude, Grok, Gemini, Kimi and Qwen scored on the same fixtures, plus match-winner hit rate by league.",
  alternates: { canonical: spUrl("/accuracy") },
};

const pct = (r: number) => `${Math.round(r * 100)}%`;
const th = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide";
const td = "px-3 py-3 border-t";

export default async function AccuracyPage() {
  const [models, leagues] = await Promise.all([fetchModelLeaderboard(), fetchLeagueAccuracy()]);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Sports Predictions accuracy report",
    description: "Graded prediction accuracy by AI model and by league. Predictions are timestamped before kick-off.",
    url: spUrl("/accuracy"),
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "Sports Predictions", url: SP_URL },
    measurementTechnique: "Pre-kickoff predictions scored against final results",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <section className="py-10">
        <p className="sp-eyebrow">Honest accuracy tracking</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">Accuracy report</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>Every prediction is stored with a timestamp before kick-off and graded when the result is final. Nothing is deleted or re-scored. {EXCLUSION_NOTE_EN}</p>
      </section>

      <section className="sp-card overflow-x-auto">
        <div className="p-5 pb-0">
          <p className="sp-eyebrow">AI model leaderboard</p>
          <h2 className="mt-1 text-xl font-extrabold">Same fixtures, seven models</h2>
        </div>
        <table className="mt-4 w-full min-w-[640px] text-sm">
          <thead style={{ color: "var(--sp-fg-muted)" }}>
            <tr><th className={th}>#</th><th className={th}>Model</th><th className={th}>Overall</th><th className={th}>Match winner</th><th className={th}>Last 100</th><th className={th}>Graded</th></tr>
          </thead>
          <tbody>
            {models.map((r, i) => (
              <tr key={r.model} style={{ borderColor: "var(--sp-border)" }}>
                <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)", color: "var(--sp-fg-dim)" }}>{i + 1}</td>
                <td className={td} style={{ borderColor: "var(--sp-border)" }}><div className={i === 0 ? "font-extrabold" : "font-semibold"}>{r.label}</div><div className="text-xs" style={{ color: "var(--sp-fg-dim)" }}>{r.vendor}</div></td>
                <td className={`${td} sp-mono font-bold`} style={{ borderColor: "var(--sp-border)", color: i === 0 ? "var(--sp-lime)" : "var(--sp-fg)" }}>{r.graded ? pct(r.rate) : "—"}</td>
                <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)" }}>{r.oneXTwo.graded ? pct(r.oneXTwo.rate) : "—"} <span style={{ color: "var(--sp-fg-dim)" }}>({r.oneXTwo.graded})</span></td>
                <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)" }}>{r.recent100.graded ? pct(r.recent100.rate) : "—"}</td>
                <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)", color: "var(--sp-fg-muted)" }}>{r.correct}/{r.graded}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-5 text-xs" style={{ color: "var(--sp-fg-dim)" }}>Overall = match winner + handicap + over/under combined. Models joined at different dates, so &quot;Last 100&quot; compares them on equal sample size.</p>
      </section>

      <section className="sp-card mt-8 overflow-x-auto">
        <div className="p-5 pb-0">
          <p className="sp-eyebrow">Scorebase model by league</p>
          <h2 className="mt-1 text-xl font-extrabold">Match-winner hit rate</h2>
        </div>
        <table className="mt-4 w-full min-w-[640px] text-sm">
          <thead style={{ color: "var(--sp-fg-muted)" }}>
            <tr><th className={th}>League</th><th className={th}>All-time</th><th className={th}>Last 30d</th><th className={th}>Last 7d</th><th className={th}>Strong picks</th><th className={th}>Graded</th></tr>
          </thead>
          <tbody>
            {leagues.map((l) => {
              const lg = leagueByCode(l.code);
              const s = l.stat;
              return (
                <tr key={l.code}>
                  <td className={`${td} font-semibold`} style={{ borderColor: "var(--sp-border)" }}>{lg ? <Link href={`/${lg.slug}`} className="hover:underline">{l.name}</Link> : l.name}</td>
                  <td className={`${td} sp-mono font-bold`} style={{ borderColor: "var(--sp-border)" }}>{pct(s.oneXTwo.rate)}</td>
                  <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)" }}>{s.rolling30.evaluated ? pct(s.rolling30.rate) : "—"}</td>
                  <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)" }}>{s.rolling7.evaluated ? pct(s.rolling7.rate) : "—"}</td>
                  <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)" }}>{s.strong.evaluated ? `${pct(s.strong.rate)} (${s.strong.evaluated})` : "—"}</td>
                  <td className={`${td} sp-mono`} style={{ borderColor: "var(--sp-border)", color: "var(--sp-fg-muted)" }}>{s.oneXTwo.correct}/{s.oneXTwo.evaluated}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="p-5 text-xs" style={{ color: "var(--sp-fg-dim)" }}>Football draws count as a miss unless the model picked the draw. Strong picks are fixtures where the top probability clears a league-specific threshold.</p>
      </section>
    </>
  );
}
