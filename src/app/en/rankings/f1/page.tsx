// /en/rankings/f1 — F1 챔피언십 순위 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import DriverAvatar from "@/components/scores/f1/DriverAvatar";
import { fetchF1Championship, F1_TEAM_LOGO } from "@/lib/sports/espn-f1";
import { SITE_URL } from "@/lib/site-url";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 1800;

const YEAR = String(new Date().getFullYear());

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const isTeam = sp?.view === "team";
  const label = isTeam ? "Constructor" : "Driver";
  return {
    title: `F1 ${label} Championship Standings — Points and Wins (${YEAR})`,
    description: `${YEAR} Formula 1 ${label.toLowerCase()} championship standings. Points, race wins and gap to the leader for Verstappen, Hamilton, Leclerc and every Red Bull, Ferrari and McLaren entry.`,
    keywords: [
      "F1 standings", "F1 driver standings", "F1 championship", "Formula 1 standings",
      "constructor standings", "F1 points", "Verstappen", "Hamilton", "Leclerc", "Norris",
    ],
    alternates: {
      canonical: `${SITE_URL}/en/rankings/f1${isTeam ? "?view=team" : ""}`,
      languages: koEnLanguages(
        `/rankings/f1${isTeam ? "?view=team" : ""}`,
        `/en/rankings/f1${isTeam ? "?view=team" : ""}`,
      ),
    },
  };
}

export default async function F1RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const isTeam = sp?.view === "team";
  const { drivers, constructors } = await fetchF1Championship(YEAR);

  const leader = drivers[0];

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> F1 · {YEAR} season
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          F1 Championship Standings
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {YEAR} Formula 1 driver and constructor standings — points, race wins and gap to the leader.
          {leader && (
            <>
              {" "}Current leader: <strong className="text-neutral-800 dark:text-neutral-200">{leader.name}</strong>
              {leader.team && ` (${leader.team})`} · {leader.points} pts.
            </>
          )}
        </p>
      </header>

      {/* 뷰 탭 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {[
          { key: "driver", label: "Drivers", href: "/en/rankings/f1" },
          { key: "team", label: "Constructors", href: "/en/rankings/f1?view=team" },
        ].map((t) => {
          const on = (t.key === "team") === isTeam;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/en/scores?sport=f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🏎️ F1 race calendar & results
        </Link>
        <Link
          href="/en/salaries/f1"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          Driver salary ranking
        </Link>
      </div>

      {(isTeam ? constructors.length : drivers.length) === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          Could not load championship data. Please try again shortly.
        </div>
      ) : isTeam ? (
        /* 컨스트럭터 */
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[40px_1fr_56px_56px_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">Rank</span>
            <span>Team</span>
            <span className="text-center">Wins</span>
            <span className="text-center">Poles</span>
            <span className="text-right">Points</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {constructors.map((c) => (
              <li key={c.name} className="grid grid-cols-[40px_1fr_56px_56px_72px] items-center gap-2 px-3 sm:px-4 py-3">
                <span className={`text-center font-black tabular-nums ${c.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {c.rank}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-4 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color ?? "#9CA3AF" }}
                    aria-hidden
                  />
                  <TeamBadge logoUrl={F1_TEAM_LOGO[c.name] ?? null} size={22} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {c.name}
                    </span>
                  </span>
                </span>
                <span className={`text-center text-sm tabular-nums ${c.wins > 0 ? "font-bold text-amber-500" : "text-neutral-400"}`}>
                  {c.wins}
                </span>
                <span className="text-center text-sm tabular-nums text-neutral-500">{c.poles}</span>
                <span className="text-right text-sm font-black tabular-nums text-neutral-900 dark:text-white">
                  {c.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        /* 드라이버 */
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[40px_1fr_52px_60px_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">Rank</span>
            <span>Drivers</span>
            <span className="text-center">Wins</span>
            <span className="text-center">Gap</span>
            <span className="text-right">Points</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {drivers.map((d) => (
              <li key={d.athleteId}>
                <Link
                  href={`/en/rankings/f1/${d.athleteId}`}
                  className="grid grid-cols-[40px_1fr_52px_60px_72px] items-center gap-2 px-3 sm:px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                >
                <span className={`text-center font-black tabular-nums ${d.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                  {d.rank}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: d.teamColor ?? "#9CA3AF" }}
                    aria-hidden
                  />
                  <DriverAvatar
                    photo={`https://a.espncdn.com/i/headshots/rpm/players/full/${d.athleteId}.png`}
                    flag={d.flag}
                    country={d.countryEn}
                    name={d.name}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {d.name}
                      {d.carNumber && (
                        <span className="ml-1.5 align-middle text-[10px] font-bold text-neutral-400">#{d.carNumber}</span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-400">
                      {d.team ?? ""}
                      {d.dnf > 0 && ` · DNF ${d.dnf}`}
                    </span>
                  </span>
                </span>
                <span className={`text-center text-sm tabular-nums ${d.wins > 0 ? "font-bold text-amber-500" : "text-neutral-400"}`}>
                  {d.wins}
                </span>
                <span className="text-center text-[12px] tabular-nums text-neutral-500">
                  {d.rank === 1 ? "—" : `-${d.behind}`}
                </span>
                <span className="text-right text-sm font-black tabular-nums text-neutral-900 dark:text-white">
                  {d.points}
                </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        Official results can take some time to appear after a race finishes. Gap is the points difference to the leader,
        DNF is the number of races not finished. Data from ESPN.
      </footer>
    </main>
  );
}
