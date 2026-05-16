// 리그별 순위표 페이지 — 36개 축구 리그 + 야구/농구/하키 일부 지원.
// /standings/EPL, /standings/K_LEAGUE_1 등.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { calcStandings } from "@/lib/predict/standings";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { SOCCER_LEAGUES } from "@/lib/sports/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ league: string }>;
}

const VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  "NBA",
  "NHL",
  "KBO",
  "NPB",
  "MLB",
]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  return {
    title: `${name} 순위표 — 스코어베이스`,
    description: `${name} 시즌 순위표. 승점·승무패·골득실·득점·실점 한눈에. 매일 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/standings/${upper}` },
  };
}

export default async function StandingsPage({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) notFound();
  const name = LEAGUE_DISPLAY[upper] ?? upper;

  // 시즌 매치 — 완료된 것만 사용해서 순위 계산
  const matches = await prisma.match.findMany({
    where: { league: upper },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  if (matches.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-black tracking-tight mb-2">{name} 순위표</h1>
        <p className="text-sm text-neutral-500">시즌 매치 데이터가 아직 수집되지 않았습니다.</p>
      </div>
    );
  }

  const standings = calcStandings(matches);
  const teamIds = standings.rows.map((r) => r.teamId);
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/leagues/${upper}`} className="hover:underline">
          {name}
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">순위표</span>
      </nav>

      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-1">
          {standings.rows.length}팀 · 시즌 진행 중 · 매일 자동 갱신
        </p>
      </header>

      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
              <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
              <th className="text-left py-2 px-2 font-semibold">팀</th>
              <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
              <th className="text-center py-2 px-2 font-semibold w-10">승</th>
              <th className="text-center py-2 px-2 font-semibold w-10">무</th>
              <th className="text-center py-2 px-2 font-semibold w-10">패</th>
              <th className="text-center py-2 px-2 font-semibold w-12">득점</th>
              <th className="text-center py-2 px-2 font-semibold w-12">실점</th>
              <th className="text-center py-2 px-2 font-semibold w-12">득실</th>
              <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>
            </tr>
          </thead>
          <tbody>
            {standings.rows.map((r) => {
              const t = teamMap.get(r.teamId);
              if (!t) return null;
              const ko = toKoreanTeamName(t.name);
              const gd = r.goalDiff;
              return (
                <tr
                  key={r.teamId}
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
                >
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">
                    {r.position}
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/teams/${t.id}`}
                      prefetch={false}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                      )}
                      <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{ko}</span>
                    </Link>
                  </td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.draws}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.losses}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsFor}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsAgainst}</td>
                  <td className={`text-center py-2 px-2 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ FINISHED 매치만 집계. SCHEDULED/POSTPONED 제외.
      </div>
    </div>
  );
}
