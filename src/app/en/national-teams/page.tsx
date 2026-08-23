// /en/national-teams — 2026 월드컵 출전 48개국 허브 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { koEnLanguages } from "@/lib/i18n/en";
import { WORLD_CUP_GROUPS, WORLD_CUP_TEAM_ELO } from "@/lib/predict/world-cup-elos";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { breadcrumbLd, itemListLd, jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "2026 World Cup — All 48 Qualified Nations by Group",
  description:
    "Every nation at the 2026 North American World Cup, laid out by group (A–L). Elo strength ratings and FIFA rankings for each country, linking through to squads, managers and fixtures.",
  keywords: [
    "2026 World Cup teams",
    "World Cup groups",
    "World Cup group stage",
    "national team squads",
    "World Cup power ratings",
  ],
  alternates: {
    canonical: "/en/national-teams",
    languages: koEnLanguages("/national-teams", "/en/national-teams"),
  },
};

export default async function NationalTeamsIndex() {
  const teams = await prisma.team.findMany({
    where: { league: "WORLD_CUP" },
    select: { id: true, name: true },
  });
  const byName = new Map(teams.map((t) => [t.name, t]));

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbLd([
              { name: "Home", path: "/en" },
              { name: "2026 World Cup", path: "/en/world-cup" },
              { name: "National teams", path: "/en/national-teams" },
            ]),
            itemListLd({
              name: "2026 FIFA World Cup national teams",
              items: teams.map((t) => ({
                name: t.name,
                path: `/en/national-teams/${t.id}`,
              })),
            }),
          ]),
        }}
      />
      <AmbientGlow />
      <header>
        <Link
          href="/en/world-cup"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <Trophy className="h-3 w-3" aria-hidden /> 2026 World Cup
        </Link>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          All 48 Qualified Nations, Group by Group
        </h1>
        <p className="mt-3 text-sm text-neutral-600 leading-relaxed break-keep dark:text-neutral-400">
          Tap a nation for its squad, manager, recent form and fixtures. Elo is our own strength rating (higher is stronger); the figure in brackets is the FIFA ranking.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(WORLD_CUP_GROUPS).map(([group, names]) => {
          const sorted = [...names].sort(
            (a, b) => (WORLD_CUP_TEAM_ELO[b] ?? 0) - (WORLD_CUP_TEAM_ELO[a] ?? 0),
          );
          return (
            <section
              key={group}
              className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] p-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
            >
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-bold">Group {group}</h2>
                <Link
                  href={`/en/world-cup/best-xi/${group.toLowerCase()}`}
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  prefetch={false}
                >
                  Group best XI →
                </Link>
              </div>
              <ul className="space-y-2">
                {sorted.map((name) => {
                  const team = byName.get(name);
                  const ko = name;
                  const rank = getFifaRank(name);
                  const elo = WORLD_CUP_TEAM_ELO[name];
                  const inner = (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-base w-6 text-center">{fifaFlag(name)}</span>
                      <span className="font-medium truncate">
                        {ko}
                        {rank != null && (
                          <span className="ml-1 text-[11px] text-neutral-400">(#{rank})</span>
                        )}
                      </span>
                      {elo != null && (
                        <span className="ml-auto tabular-nums text-xs text-neutral-500">
                          {elo}
                        </span>
                      )}
                    </span>
                  );
                  return (
                    <li key={name}>
                      {team ? (
                        <Link
                          href={`/en/national-teams/${team.id}`}
                          className="block rounded-lg px-2 py-1.5 -mx-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                          prefetch={false}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="px-2 py-1.5 -mx-2 opacity-70">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 leading-relaxed break-keep">
        ⓘ Groups follow the 2026 World Cup final draw. Title and qualification probabilities are on the{" "}
        <Link href="/en/world-cup" className="underline">
          World Cup hub
        </Link>
        and{" "}
        <Link href="/en/predictions/WORLD_CUP" className="underline">
          World Cup predictions
        </Link>{" "}
        pages.
      </p>
    </div>
  );
}
