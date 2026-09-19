// /today — 앞으로 48시간 전체 경기 목록(단일 페이지). 홈은 핵심 경기만 보여주므로 나머지는 여기서.
import type { Metadata } from "next";
import { fetchUpcoming } from "@/lib/sp/data";
import { spUrl } from "@/lib/sp/site";
import MatchCard from "@/components/sp/MatchCard";
import LeagueChips from "@/components/sp/LeagueChips";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "All Fixtures — Next 48 Hours with Win Probabilities",
  description: "Every upcoming fixture with a model prediction across 13 leagues for the next 48 hours. Key matches are picked out on the home page.",
  alternates: { canonical: spUrl("/today") },
};

export default async function TodayPage() {
  const upcoming = await fetchUpcoming({ hours: 48, take: 120 });
  return (
    <>
      <section className="py-10">
        <LeagueChips />
        <p className="sp-eyebrow mt-8">All fixtures</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-5xl">Next 48 hours</h1>
        <p className="mt-3 max-w-2xl" style={{ color: "var(--sp-fg-muted)" }}>{upcoming.length} fixtures with a model probability. The handful we consider key matches are on the home page.</p>
      </section>
      {upcoming.length === 0 ? (
        <p className="sp-card p-6 text-sm" style={{ color: "var(--sp-fg-muted)" }}>No fixtures with predictions in the next 48 hours.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div>
      )}
    </>
  );
}
