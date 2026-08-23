// /en/salaries/tennis — ATP·WTA 시즌 상금 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/en/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import { fetchTennisRankings, type Tour } from "@/lib/sports/espn-tennis";
import { TENNIS_PRIZE_AS_OF } from "@/lib/sports/tennis-prize-money";
import { CircleDollarSign } from "lucide-react";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;


export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const isWta = sp?.tour === "wta";
  const label = isWta ? "WTA" : "ATP";
  return {
    title: `Tennis Prize Money — ${label} Season Earnings Ranking`,
    description: `${label} year-to-date prize money ranking, top 50 in USD. Official singles and doubles earnings — data from ATP and WTA.`,
    keywords: ["tennis prize money", "ATP prize money", "WTA prize money", "tennis earnings ranking", "Sinner prize money", "Sabalenka prize money"],
    alternates: {
      canonical: `https://www.scorebase.kr/en/salaries/tennis${isWta ? "?tour=wta" : ""}`,
      languages: koEnLanguages(
        `/salaries/tennis${isWta ? "?tour=wta" : ""}`,
        `/en/salaries/tennis${isWta ? "?tour=wta" : ""}`,
      ),
    },
  };
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
function fmtFull(n: number): string {
  return `$${n.toLocaleString()}`;
}
/** 이름 매칭 키 — 소문자 + 분음부호 제거 (PDF 표기와 ESPN 표기 흡수). */
function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export default async function TennisSalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  const sp = await searchParams;
  const tour: Tour = sp?.tour === "wta" ? "WTA" : "ATP";
  const [rows, ranks] = await Promise.all([
    prisma.playerSalary.findMany({
      where: { league: tour === "WTA" ? "TENNIS_WTA" : "TENNIS_ATP" },
      orderBy: { rank: "asc" },
    }),
    fetchTennisRankings(tour),
  ]);
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());

  // ESPN 랭킹 이름 매칭 → 한글명·국적·선수 페이지 링크.
  // 중국 선수 등 성-이름 순서가 소스별로 달라(WTA "Shuai Zhang" vs ESPN "Zhang Shuai") 역순 키도 함께 둔다.
  const rankMap = new Map<string, (typeof ranks)[number]>();
  for (const r of ranks) {
    rankMap.set(nameKey(r.name), r);
    const reversed = nameKey(r.name.split(" ").reverse().join(" "));
    if (!rankMap.has(reversed)) rankMap.set(reversed, r);
  }

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/en/salaries/tennis" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/en/scores?sport=tennis" className="hover:underline">Tennis</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">Prize Money</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Prize Money
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> Tennis Prize Money
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} season {tour === "WTA" ? "WTA" : "ATP"} prize money (YTD, singles + doubles) — top {rows.length || 50} in USD · as of {TENNIS_PRIZE_AS_OF}.
        </p>
      </header>

      {/* 투어 탭 — /rankings/tennis 와 같은 패턴 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(["ATP", "WTA"] as const).map((t) => {
          const on = tour === t;
          return (
            <Link
              key={t}
              href={t === "ATP" ? "/en/salaries/tennis" : "/en/salaries/tennis?tour=wta"}
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

      <p className="text-xs text-neutral-500">
        Looking for performance rankings?{" "}
        <Link href={tour === "WTA" ? "/en/rankings/tennis?tour=wta" : "/en/rankings/tennis"} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          View tennis world rankings
        </Link>
        .
      </p>

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
                const hit = rankMap.get(nameKey(r.playerName));
                const display = r.playerName;
                const country = hit?.countryEn ?? (r.teamName || null);
                const name = (
                  <>
                    <PlayerPhoto photo={r.photoUrl} name={display} />
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>{display}</span>
                    </span>
                  </>
                );
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      {hit ? (
                        <Link href={`/en/rankings/tennis/${hit.athleteId}`} className="flex items-center gap-2.5 hover:underline">
                          {name}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5">{name}</div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5">
                        {hit?.flag && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={hit.flag} alt="" className="w-4 h-3 shrink-0 object-cover rounded-[2px]" />
                        )}
                        {country ?? "—"}
                      </span>
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
        Official year-to-date prize money for the {season} season (singles, doubles and mixed combined, USD), as published {TENNIS_PRIZE_AS_OF}.
        Some doubles specialists have no country match and are shown without a flag. Data by{" "}
        <a href="https://www.protennislive.com/posting/ramr/current_prize.pdf" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          ATP
        </a>
        {" · "}
        <a href="https://wtafiles.wtatennis.com/pdf/rankings/All_YTD_Prize_Money.pdf" target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          WTA
        </a>
        .
      </footer>
    </main>
  );
}
