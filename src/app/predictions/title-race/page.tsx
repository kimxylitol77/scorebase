// /predictions/title-race — 전 리그 우승 경쟁 trackerboard.
// 각 리그의 1~3위 + 격차 + 잔여 경기 + Elo 예측 우승 확률 횡단 표시.

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  getFullStandings,
  GROUPED_STANDINGS_LEAGUES,
  type StandingsRow,
} from "@/lib/sports/thesports/standings-helper";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "우승 경쟁 trackerboard — 스코어베이스",
  description:
    "전 세계 80+ 축구 리그의 우승 경쟁 현황을 한눈에. 1위와 2위 승점차, 잔여 경기, 챔피언 후보 비교. 스코어베이스.",
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
      name: toKoreanTeamName(nameById.get(r.teamId) ?? `Team ${r.teamId}`, league),
      teamId: r.teamId,
      points: r.points,
      won: r.won,
      draw: r.draw,
      loss: r.loss,
      played: r.won + r.draw + r.loss,
    }));
    out.push({
      league,
      leagueDisplay: LEAGUE_DISPLAY[league] ?? league,
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
  if (gap === 0) return { label: "공동 1위", color: "text-rose-600 dark:text-rose-400" };
  if (gap <= 2) return { label: "초접전", color: "text-rose-600 dark:text-rose-400" };
  if (gap <= 5) return { label: "접전", color: "text-amber-600 dark:text-amber-400" };
  if (gap <= 10) return { label: "추격권", color: "text-blue-600 dark:text-blue-400" };
  return { label: "우승 굳히기", color: "text-emerald-600 dark:text-emerald-400" };
}

export default async function TitleRacePage() {
  const races = await buildRaces();
  const hotCount = races.filter((r) => (r.gap12 ?? 999) <= 5).length;
  const decidedCount = races.filter((r) => (r.gap12 ?? 0) > 10).length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <Link href="/predictions" className="hover:underline">시즌 예측</Link>
          <span>›</span>
          <span>우승 경쟁</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">🏆 우승 경쟁 trackerboard</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          전 세계 {races.length}개 축구 리그의 우승 경쟁 현황. 1~3위 + 승점차로 정렬 — 격차 작은 리그가 위.
          초접전 (5점 이내) {hotCount}개 / 우승 굳히기 (10점+) {decidedCount}개.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {races.map((r) => {
          const tight = tightnessLabel(r.gap12);
          return (
            <Link
              key={r.league}
              href={`/predictions/${r.league}`}
              className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 hover:-translate-y-0.5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm transition-all space-y-3"
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
                    <th className="text-left font-semibold pb-1">팀</th>
                    <th className="text-center font-semibold pb-1 w-10">경기</th>
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
                    1·2위 격차 <span className="font-bold tabular-nums text-neutral-800 dark:text-neutral-200">{r.gap12}점</span>
                  </span>
                )}
                {r.gap13 != null && (
                  <span className="text-neutral-500">
                    1·3위 격차 <span className="font-bold tabular-nums text-neutral-800 dark:text-neutral-200">{r.gap13}점</span>
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </section>

      {races.length === 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-white/10 px-5 py-10 text-center text-sm text-neutral-500">
          순위 데이터 수집 대기 중 — 첫 cron 실행 후 표시 (매일 05:00 KST)
        </div>
      )}

      <section className="pt-6 border-t border-neutral-200 dark:border-neutral-800 text-sm text-neutral-600 dark:text-neutral-400">
        <p>
          각 리그 카드를 클릭하면 Elo 기반 시즌 예측 + Monte Carlo 우승 확률 곡선을 볼 수 있습니다.
        </p>
      </section>
    </main>
  );
}
