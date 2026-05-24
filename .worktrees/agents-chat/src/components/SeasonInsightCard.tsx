// 메인 페이지용 컴팩트 시즌 인사이트 카드.
// 한 리그의 핵심 정보 (1위/우승확률/공격 1위) 한 눈에.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";

type Lg =
  | "EPL"
  | "NBA"
  | "NHL"
  | "MLB"
  | "LALIGA"
  | "BUNDESLIGA"
  | "SERIE_A"
  | "LIGUE_1"
  | "MLS"
  | "UCL";

interface Props {
  league: Lg;
}

const INFO: Record<
  Lg,
  { name: string; gradient: string; relegationCount: number }
> = {
  EPL: {
    name: "프리미어리그",
    gradient: "from-purple-600 via-fuchsia-500 to-pink-500",
    relegationCount: 3,
  },
  LALIGA: {
    name: "라리가",
    gradient: "from-amber-500 via-red-600 to-yellow-500",
    relegationCount: 3,
  },
  BUNDESLIGA: {
    name: "분데스리가",
    gradient: "from-yellow-400 via-red-600 to-slate-900",
    relegationCount: 3,
  },
  SERIE_A: {
    name: "세리에 A",
    gradient: "from-sky-500 via-blue-700 to-emerald-600",
    relegationCount: 3,
  },
  LIGUE_1: {
    name: "리그 1",
    gradient: "from-blue-700 via-rose-600 to-indigo-600",
    relegationCount: 2,
  },
  MLS: {
    name: "MLS",
    gradient: "from-red-600 via-slate-900 to-blue-700",
    relegationCount: 0,
  },
  UCL: {
    name: "챔피언스리그",
    gradient: "from-indigo-700 via-blue-600 to-cyan-500",
    relegationCount: 0,
  },
  NBA: {
    name: "NBA",
    gradient: "from-orange-500 via-amber-500 to-yellow-500",
    relegationCount: 0,
  },
  NHL: {
    name: "NHL",
    gradient: "from-cyan-500 via-blue-600 to-indigo-700",
    relegationCount: 0,
  },
  MLB: {
    name: "MLB",
    gradient: "from-emerald-500 via-green-600 to-teal-700",
    relegationCount: 0,
  },
};

export default async function SeasonInsightCard({ league }: Props) {
  const info = INFO[league];

  const dbMatches = await prisma.match.findMany({
    where: { league },
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
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));

  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  if (finishedCount < 5) {
    return (
      <Link
        href={`/leagues/${league}`}
        className="block group rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 transition"
      >
        <div className={`h-2 bg-gradient-to-r ${info.gradient}`} />
        <div className="p-4">
          <div className="text-sm font-bold">{info.name}</div>
          <div className="mt-2 text-xs text-neutral-500">
            데이터 수집 중 ({finishedCount}경기)
          </div>
        </div>
      </Link>
    );
  }

  const standings = calcStandings(matches);
  const eloTable = calcEloTable(matches);
  const teams = await prisma.team.findMany({
    where: { league, id: { in: standings.rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, toKoreanTeamName(t.name)]));

  const top1 = standings.rows[0];

  // 우승 확률 (Monte Carlo, scheduled 있을 때만)
  let topChampPct: { name: string; pct: number } | null = null;
  if (scheduledCount > 0 && finishedCount >= 20) {
    const mc = runMonteCarlo(matches, league, {
      iterations: 500,
      relegationCount: info.relegationCount,
    });
    const champ = mc.find((r) => r.champion > 0);
    if (champ) {
      topChampPct = {
        name: nameById.get(champ.teamId) ?? "?",
        pct: champ.champion * 100,
      };
    }
  }

  const top1Elo = getElo(eloTable, top1.teamId);

  return (
    <Link
      href={`/leagues/${league}`}
      className="block group rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden hover:border-neutral-400 dark:hover:border-neutral-600 hover:-translate-y-0.5 hover:shadow-sm transition-all"
    >
      <div className={`h-2 bg-gradient-to-r ${info.gradient}`} />
      <div className="p-4 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold tracking-tight truncate">
            {info.name}
          </div>
          <div className="text-[10px] text-neutral-400 tabular-nums shrink-0 ml-2">
            {finishedCount}경기
          </div>
        </div>

        {/* 1위 */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            1위
          </div>
          <div className="font-semibold text-sm truncate">
            {nameById.get(top1.teamId) ?? "?"}
          </div>
          <div className="text-[11px] text-neutral-500 tabular-nums">
            {top1.points}점 · Elo {Math.round(top1Elo)}
          </div>
        </div>

        {/* 우승 확률 */}
        {topChampPct && (
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              우승 확률
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium truncate">
                {topChampPct.name}
              </span>
              <span className="text-base font-black tabular-nums">
                {topChampPct.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
