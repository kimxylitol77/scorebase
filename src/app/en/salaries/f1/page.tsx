// /en/salaries/f1 — F1 드라이버 연봉 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerValueTabs from "@/components/en/PlayerValueTabs";
import PlayerPhoto from "@/components/PlayerPhoto";
import TeamBadge from "@/components/TeamBadge";
import { F1_TEAM_COLOR, F1_TEAM_LOGO, fetchF1Championship } from "@/lib/sports/espn-f1";
import { F1_SALARY_AS_OF, F1_SALARY_SOURCE_URL } from "@/lib/sports/f1-salaries";
import { CircleDollarSign } from "lucide-react";
import { koEnLanguages } from "@/lib/i18n/en";

export const revalidate = 3600;


export const metadata: Metadata = {
  title: "F1 Driver Salaries — Estimated Earnings Ranking",
  description:
    "2026 Formula 1 driver salary rankings in USD. Estimated base pay for Max Verstappen, Lewis Hamilton, Charles Leclerc and every driver on the grid — aggregated media estimates, as teams do not disclose salaries.",
  keywords: ["F1 driver salaries", "Formula 1 salaries", "Verstappen salary", "Hamilton salary", "F1 highest paid drivers"],
  alternates: {
    canonical: "https://www.scorebase.kr/en/salaries/f1",
    languages: koEnLanguages("/salaries/f1", "/en/salaries/f1"),
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
// 이름 매칭용 정규화 — 소문자 + 발음기호 제거 (DB 는 영문 이름만 있어 ESPN athleteId 를 이름으로 연결)
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default async function F1SalariesPage() {
  const rows = await prisma.playerSalary.findMany({
    where: { league: "F1" },
    orderBy: { rank: "asc" },
  });
  const season = rows[0]?.season ?? String(new Date().getUTCFullYear());
  // 드라이버 상세 링크 — ESPN standings 이름 매칭 (2026 시즌 22명 전원 정확 일치 실측, 실패 시 링크 없이 표시)
  const { drivers: championshipDrivers } = await fetchF1Championship(String(new Date().getUTCFullYear()));
  const idByName = new Map(championshipDrivers.map((d) => [normName(d.name), d.athleteId]));

  return (
    <main className="relative max-w-3xl lg:max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <PlayerValueTabs active="/en/salaries/f1" />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/en/scores?sport=f1" className="hover:underline">F1</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">Driver Salaries</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Salaries
        </span>
        <h1 className="flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <CircleDollarSign className="h-8 w-8 shrink-0 text-rose-500" aria-hidden /> F1 Driver Salaries
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          {season} season — {rows.length || 22}drivers by estimated base salary (USD, bonuses excluded).
        </p>
      </header>

      {/* 추정치 고지 — F1 은 연봉 공식 발표가 없다 */}
      <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
        F1 teams do not disclose driver salaries officially. The figures below are <strong>aggregated media estimates</strong>{" "}
        (RacingNews365 (aggregated media estimates), as of {F1_SALARY_AS_OF}) and may differ from actual contract terms.
      </div>

      <p className="text-xs text-neutral-500">
        Looking for championship standings?{" "}
        <Link href="/en/rankings/f1" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          View F1 championship standings
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">Salary data is loading.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-neutral-800 dark:bg-white/[0.04] dark:shadow-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                <th className="px-3 py-2.5 text-center font-semibold w-12">#</th>
                <th className="px-2 py-2.5 text-left font-semibold">Driver</th>
                <th className="px-2 py-2.5 text-left font-semibold hidden sm:table-cell">Team</th>
                <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Salary (est.)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top3 = r.rank <= 3;
                const teamKo = r.teamName;
                const color = F1_TEAM_COLOR[r.teamName] ?? "#9CA3AF";
                const athleteId = idByName.get(normName(r.playerName)) ?? null;
                return (
                  <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60 last:border-0 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 text-center tabular-nums font-bold text-neutral-400">{r.rank}</td>
                    <td className="px-2 py-2.5">
                      {athleteId ? (
                        <Link href={`/en/rankings/f1/${athleteId}`} className="flex items-center gap-2.5 group">
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                          <PlayerPhoto photo={r.photoUrl} name={r.playerName} />
                          <span className="min-w-0">
                            <span className={`block truncate font-semibold group-hover:underline ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                              {r.playerName}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                          <PlayerPhoto photo={r.photoUrl} name={r.playerName} />
                          <span className="min-w-0">
                            <span className={`block truncate font-semibold ${top3 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                              {r.playerName}
                            </span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-neutral-500 hidden sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <TeamBadge logoUrl={F1_TEAM_LOGO[r.teamName] ?? null} size={18} />
                        {teamKo}
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
        Figures are estimated base salaries for the {season} season (USD, excluding bonuses and endorsements).
        Some rookies are shown at the lower bound of an estimated range ($500K–$1M). Estimates from{" "}
        <a href={F1_SALARY_SOURCE_URL} target="_blank" rel="nofollow noopener" className="text-blue-600 dark:text-blue-400 hover:underline">
          RacingNews365
        </a>
        .
      </footer>
    </main>
  );
}
