// /en/salaries/golf — PGA 투어 상금 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/en/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import { CircleDollarSign } from "lucide-react";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;


export const metadata: Metadata = {
  title: "Golf Prize Money Rankings — PGA Tour Season Earnings",
  description:
    "PGA Tour season earnings (money list) in USD. Top 60 by prize money, updated weekly. Data from ESPN.",
  keywords: ["golf prize money", "PGA Tour money list", "PGA earnings ranking", "golf earnings", "PGA Tour prize money"],
  alternates: {
    canonical: "https://www.scorebase.kr/en/salaries/golf",
    languages: koEnLanguages("/salaries/golf", "/en/salaries/golf"),
  },
};

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default async function GolfSalariesPage() {
  const rows = await prisma.playerSalary.findMany({
    where: { league: "GOLF" },
    orderBy: { rank: "asc" },
  });
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());
  const updated = rows[0]?.updatedAt ? rows[0].updatedAt.toISOString().slice(0, 10) : null;

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/en/salaries/golf" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/en/scores?sport=golf" className="hover:underline">Golf</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">Prize Money</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Prize Money
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> Golf Prize Money Rankings
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} PGA Tour official money list — top {rows.length || 60} (USD) · updated weekly.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">Prize money data is loading.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">Player</th>
                <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">Country</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Season Earnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <PlayerPhoto photo={r.photoUrl} name={r.playerName} />
                        <span className="min-w-0">
                          <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {r.playerName}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                      {r.teamName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap" title={fmtFull(r.salary)}>
                      <div className="tabular-nums font-bold">{fmtUsd(r.salary)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-neutral-200 dark:border-neutral-800 pt-4 text-xs text-neutral-400 leading-relaxed">
        Official PGA Tour money (Official Money, USD) for the {season} season.
        {updated && ` Last updated ${updated}.`} Data by{" "}
        <a href="https://www.espn.com/golf/moneylist" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          ESPN
        </a>
        .
      </footer>
    </main>
  );
}
