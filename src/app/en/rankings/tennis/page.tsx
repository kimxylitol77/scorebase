// /en/rankings/tennis — ATP·WTA 세계랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import DriverAvatar from "@/components/scores/f1/DriverAvatar";
import { fetchTennisRankings, type Tour } from "@/lib/sports/espn-tennis";
import { SITE_URL } from "@/lib/site-url";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const label = tour === "WTA" ? "WTA" : "ATP";
  return {
    title: `${label} Tennis World Rankings — Positions and Points`,
    description: `${label} tennis world rankings, positions 1–150. Weekly movement, ranking points and nationality for Sinner, Alcaraz, Djokovic and every ranked player.`,
    keywords: [
      "tennis world rankings", "ATP rankings", "WTA rankings", "tennis standings",
      "tennis ranking points", "Sinner ranking", "Alcaraz ranking", "Djokovic ranking",
    ],
    alternates: {
      canonical: `${SITE_URL}/en/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
      languages: koEnLanguages(
        `/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
        `/en/rankings/tennis${tour === "WTA" ? "?tour=wta" : ""}`,
      ),
    },
  };
}

export default async function TennisRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const rows = await fetchTennisRankings(tour);

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Tennis Rankings
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          Tennis World Rankings
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          ATP (men) and WTA (women) world rankings, positions 1–150 — with weekly movement and ranking points.
        </p>
      </header>

      {/* 투어 탭 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(["ATP", "WTA"] as const).map((t) => {
          const on = tour === t;
          return (
            <Link
              key={t}
              href={t === "ATP" ? "/en/rankings/tennis" : "/en/rankings/tennis?tour=wta"}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t === "ATP" ? "ATP (men)" : "WTA (women)"}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/en/scores?sport=tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🎾 Tennis live scores
        </Link>
        <Link
          href={tour === "WTA" ? "/en/salaries/tennis?tour=wta" : "/en/salaries/tennis"}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          Season prize money
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          Could not load ranking data. Please try again shortly.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {/* 헤더 행 */}
          <div className="grid grid-cols-[44px_1fr_auto_72px] sm:grid-cols-[52px_1fr_120px_88px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span className="text-center">Rank</span>
            <span>Player</span>
            <span className="hidden sm:block">Country</span>
            <span className="text-right">Points</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((r) => (
              <li key={r.athleteId}>
                <Link
                  href={`/en/rankings/tennis/${r.athleteId}`}
                  className="grid grid-cols-[44px_1fr_auto_72px] sm:grid-cols-[52px_1fr_120px_88px] items-center gap-2 px-3 sm:px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                >
                  {/* 순위 + 등락 */}
                  <span className="flex flex-col items-center leading-none">
                    <span className={`font-black tabular-nums ${r.rank <= 3 ? "text-rose-600 dark:text-rose-400" : "text-neutral-800 dark:text-neutral-200"}`}>
                      {r.rank}
                    </span>
                    {r.delta != null && (
                      <span className={`mt-0.5 text-[10px] font-bold tabular-nums ${r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                        {r.delta > 0 ? `▲${r.delta}` : `▼${Math.abs(r.delta)}`}
                      </span>
                    )}
                  </span>

                  {/* 선수 사진(국기 배지) + 선수명 (한글 우선) */}
                  <span className="flex items-center gap-2 min-w-0">
                    <DriverAvatar
                      photo={r.headshot}
                      flag={r.flag}
                      country={r.countryEn}
                      name={r.name}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {r.name}
                      </span>
                    </span>
                  </span>

                  {/* 국적 */}
                  <span className="hidden sm:flex items-center gap-1.5 min-w-0">
                    {r.flag && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.flag} alt="" className="w-4 h-3 shrink-0 object-cover rounded-[2px]" />
                    )}
                    <span className="truncate text-[12px] text-neutral-500">
                      {r.countryEn ?? ""}
                    </span>
                  </span>

                  {/* 포인트 */}
                  <span className="text-right text-sm font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
                    {r.points.toLocaleString("ko-KR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        Rankings are updated weekly from official ATP and WTA releases. Data from ESPN.
      </footer>
    </main>
  );
}
