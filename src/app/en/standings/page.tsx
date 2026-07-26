// /en/standings — 영어판 순위 허브: 종목·국가별 리그 카드 + Top3 미리보기 (ko /standings 의 린 버전).
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { prisma } from "@/lib/db";
import {
  fetchSoccerCountryGroups,
  safeFetchTop3,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "@/lib/sports/standings-overview";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { enLeagueName, toEnglishTeamName, EN_STANDINGS_LEAGUE_SET } from "@/lib/i18n/en";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "League Standings — Football & Baseball Tables",
  description:
    "Up-to-date league tables for the Premier League, LaLiga, Bundesliga, Serie A, MLS, K League, MLB, KBO, NPB and 40+ more competitions.",
  alternates: {
    canonical: `${SITE_URL}/en/standings`,
    languages: {
      ko: `${SITE_URL}/standings`,
      en: `${SITE_URL}/en/standings`,
      "x-default": `${SITE_URL}/standings`,
    },
  },
};

// 야구 — getFullStandings 가 야구를 못 주므로(safeFetchTop3 0행) 공식 야구표로 직접 구성.
// 카드는 항상 노출 (상세는 fetchBaseballTable→ts캐시→calc 폴백이라 데이터가 있음).
const BASEBALL_HUB = ["MLB", "KBO", "NPB", "CPBL"];
async function fetchBaseballGroup(): Promise<CountryStandingsGroup> {
  const leagues = await Promise.all(
    BASEBALL_HUB.map(async (league) => {
      let top3: TopThreeEntry[] = [];
      const bb = await fetchBaseballTable(league).catch(() => []);
      if (bb.length > 0) {
        const t3 = [...bb].sort((a, b) => a.position - b.position).slice(0, 3);
        const teams = await prisma.team.findMany({
          where: { id: { in: t3.map((r) => r.ourTeamId) } },
          select: { id: true, name: true },
        });
        const nameById = new Map(teams.map((t) => [t.id, toEnglishTeamName(t.name)]));
        top3 = t3.map((r) => ({
          position: r.position,
          teamId: r.ourTeamId,
          name: nameById.get(r.ourTeamId) ?? `Team ${r.ourTeamId}`,
          points: r.wins,
        }));
      } else {
        top3 = await safeFetchTop3(league, "en");
      }
      return { league, leagueDisplay: enLeagueName(league), top3 };
    }),
  );
  return { country: "⚾ Baseball", leagues };
}

function GroupSection({ group, pointsSuffix = "p" }: { group: CountryStandingsGroup; pointsSuffix?: string }) {
  // 영어판 상세 페이지가 있는 리그만 — 미지원 리그 카드가 404 로 이어지는 것 방지.
  const leagues = group.leagues.filter((l) => EN_STANDINGS_LEAGUE_SET.has(l.league));
  if (leagues.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
        <span>{group.country}</span>
        <span className="text-xs font-normal text-neutral-400">
          {leagues.length} {leagues.length === 1 ? "league" : "leagues"}
        </span>
      </h2>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
        {leagues.map((l) => (
          <Link
            key={l.league}
            href={`/en/standings/${l.league}`}
            prefetch={false}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{l.leagueDisplay}</span>
              <span className="text-xs text-neutral-400">→</span>
            </div>
            <div className="space-y-1">
              {l.top3.map((t) => (
                <div key={t.teamId} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="w-3 text-center font-bold tabular-nums text-neutral-400">{t.position}</span>
                    <span className="truncate text-neutral-700 dark:text-neutral-300">{t.name}</span>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-neutral-500">
                {t.points}
                {pointsSuffix}
              </span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function EnStandingsRoot() {
  const [baseballGroup, soccerGroups] = await Promise.all([
    fetchBaseballGroup(),
    fetchSoccerCountryGroups("en"),
  ]);

  return (
    <main className="relative mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Standings
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          League standings
        </h1>
        <p className="text-sm leading-relaxed text-neutral-500">
          Football and baseball season tables, updated throughout the day. Click any league for the
          full table.
        </p>
      </header>

      {/* 야구 — 승수(W) 표기 */}
      <GroupSection group={baseballGroup} pointsSuffix="W" />

      {/* 축구 — 국가별 */}
      <section className="space-y-6 border-t border-neutral-200 pt-6 dark:border-white/10">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">⚽ Football</h2>
        {soccerGroups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-white/15">
            No football leagues currently in season. Tables appear automatically once seasons kick off.
          </p>
        ) : (
          soccerGroups.map((g) => <GroupSection key={g.country} group={g} />)
        )}
      </section>

      <section className="space-y-3 border-t border-neutral-200 pt-6 dark:border-white/10">
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Looking for match predictions? See our{" "}
          <Link href="/en/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            AI predictions
          </Link>{" "}
          with win probabilities and published accuracy.
        </p>
      </section>
    </main>
  );
}
