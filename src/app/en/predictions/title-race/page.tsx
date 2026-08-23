// /en/predictions/title-race — 리그별 우승 경쟁 현황 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  getFullStandings,
  GROUPED_STANDINGS_LEAGUES,
  type StandingsRow,
} from "@/lib/sports/thesports/standings-helper";
import { enLeagueName, koEnLanguages } from "@/lib/i18n/en";
import AmbientGlow from "@/components/AmbientGlow";
import { Trophy } from "lucide-react";

export const revalidate = 600; // ISR — force-dynamic 제거(2026-07-02, searchParams 없음)

export const metadata: Metadata = {
  title: "Title Race Trackerboard",
  description:
    "Live title races across 80+ football leagues. Points gap between first and second, matches played, and how the contenders compare.",
  alternates: { canonical: "/predictions/title-race" },
};

// 핵심 리그만 (잘 알려진 리그 우선 + 한국 시청자 trafficking)
const TITLE_RACE_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "K_LEAGUE_1", "J1_LEAGUE", "MLS", "SAUDI_PL",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL",
  "BRASILEIRAO", "LIGA_MX", "ARGENTINA_PL",
  "EKSTRAKLASA", "AUSTRIA_BL", "DENMARK_SL", "ELITESERIEN", "ALLSVENSKAN",
  "CSL", "A_LEAGUE", "INDIA_ISL",
];

interface LeagueRace {
  league: string;
  leagueDisplay: string;
  top: Array<{
    position: number;
    name: string;
    teamId: number;
    points: number;
    won: number;
    draw: number;
    loss: number;
    played: number;
  }>;
  /** 1~2위 승점차 */
  gap12: number | null;
  /** 1~3위 승점차 */
  gap13: number | null;
}

async function buildRaces(): Promise<LeagueRace[]> {
  const out: LeagueRace[] = [];
  for (const league of TITLE_RACE_LEAGUES) {
    // 그룹 컵(J1 2026 100년 비전 = East/West)은 단일 우승 레이스가 무의미 → 제외.
    // 2026-27 정상 단일표 복귀 시 GROUPED set 비우면 자동 복귀.
    if (GROUPED_STANDINGS_LEAGUES.has(league)) continue;
    const rows = await getFullStandings(league);
    if (rows.length === 0) continue;
    const top: StandingsRow[] = rows.slice(0, 3);
    const teams = await prisma.team.findMany({
      where: { id: { in: top.map((r) => r.teamId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    const enriched = top.map((r) => ({
      position: r.position,
      name: nameById.get(r.teamId) ?? `Team ${r.teamId}`,
      teamId: r.teamId,
      points: r.points,
      won: r.won,
      draw: r.draw,
      loss: r.loss,
      played: r.won + r.draw + r.loss,
    }));
    out.push({
      league,
      leagueDisplay: enLeagueName(league),
      top: enriched,
      gap12: enriched[1] ? enriched[0].points - enriched[1].points : null,
      gap13: enriched[2] ? enriched[0].points - enriched[2].points : null,
    });
  }
  // 격차 작은 (= 우승 경쟁 hot) 리그 우선
  out.sort((a, b) => {
    const ga = a.gap12 ?? 999;
    const gb = b.gap12 ?? 999;
    return ga - gb;
  });
  return out;
}

function tightnessLabel(gap: number | null): { label: string; color: string } {
  if (gap == null) return { label: "—", color: "text-neutral-400" };
  if (gap === 0) return { label: "Level on points", color: "text-rose-600 dark:text-rose-400" };
  if (gap <= 2) return { label: "Neck and neck", color: "text-rose-600 dark:text-rose-400" };
  if (gap <= 5) return { label: "Tight", color: "text-amber-600 dark:text-amber-400" };
  if (gap <= 10) return { label: "Within reach", color: "text-blue-600 dark:text-blue-400" };
  return { label: "Pulling clear", color: "text-emerald-600 dark:text-emerald-400" };
}

export default async function TitleRacePage() {
  const races = await buildRaces();
  const hotCount = races.filter((r) => (r.gap12 ?? 999) <= 5).length;
  const decidedCount = races.filter((r) => (r.gap12 ?? 0) > 10).length;

  return (
    <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <AmbientGlow />
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/en/predictions" className="hover:underline">Season predictions</Link>
          <span>›</span>
          <span>Title Race</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Title Race
        </span>
        <h1 className="mt-4 flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          <Trophy className="h-8 w-8 shrink-0 text-rose-500 sm:h-9 sm:w-9" aria-hidden />
          Title Race Trackerboard
        </h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          Title races across {races.length}football leagues, sorted by how close the top three are — tightest races first.
          Neck and neck (within 5 pts): {hotCount}· pulling clear (10+ pts): {decidedCount}
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {races.map((r) => {
          const tight = tightnessLabel(r.gap12);
          return (
            <Link
              key={r.league}
              href={`/en/predictions/${r.league}`}
              className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4 space-y-3 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_28px_70px_-30px_rgba(15,23,30,0.28)] dark:shadow-none dark:hover:border-neutral-600 dark:hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  {r.leagueDisplay}
                </h2>
                <span className={`text-[11px] font-bold ${tight.color}`}>
                  {tight.label}
                </span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    <th className="text-left font-semibold pb-1 w-6">#</th>
                    <th className="text-left font-semibold pb-1">Team</th>
                    <th className="text-center font-semibold pb-1 w-10">P</th>
                    <th className="text-center font-semibold pb-1 w-8">W</th>
                    <th className="text-center font-semibold pb-1 w-8">D</th>
                    <th className="text-center font-semibold pb-1 w-8">L</th>
                    <th className="text-right font-semibold pb-1 w-10">P</th>
                  </tr>
                </thead>
                <tbody>
                  {r.top.map((t) => (
                    <tr key={t.teamId}>
                      <td className="tabular-nums font-bold text-neutral-500 py-0.5">{t.position}</td>
                      <td className="font-medium truncate pr-2 py-0.5">{t.name}</td>
                      <td className="text-center tabular-nums text-neutral-500 py-0.5">{t.played}</td>
                      <td className="text-center tabular-nums text-neutral-500 py-0.5">{t.won}</td>
                      <td className="text-center tabular-nums text-neutral-500 py-0.5">{t.draw}</td>
                      <td className="text-center tabular-nums text-neutral-500 py-0.5">{t.loss}</td>
                      <td className="text-right tabular-nums font-bold text-neutral-800 dark:text-neutral-200 py-0.5">{t.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between gap-3 text-xs pt-1 border-t border-neutral-100 dark:border-white/[0.06]">
                {r.gap12 != null && (
                  <span className="text-neutral-500">
                    1st–2nd gap <span className="font-bold tabular-nums text-neutral-800 dark:text-neutral-200">{r.gap12} pts</span>
                  </span>
                )}
                {r.gap13 != null && (
                  <span className="text-neutral-500">
                    1st–3rd gap <span className="font-bold tabular-nums text-neutral-800 dark:text-neutral-200">{r.gap13} pts</span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </section>

      {races.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-sm text-neutral-500 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none break-keep">
          Waiting on standings data — this fills in after the first daily sync.
        </div>
      )}

      <section className="pt-6 border-t border-black/5 dark:border-white/10 text-sm text-neutral-600 dark:text-neutral-400">
        <p className="break-keep">
          Tap a league for its Elo-based season projection and Monte Carlo title probability curve.
        </p>
      </section>
    </main>
  );
}
