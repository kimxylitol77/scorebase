// 메인 페이지용 컴팩트 시즌 인사이트 카드.
// 한 리그의 핵심 정보 (1위/우승확률/공격 1위) 한 눈에.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";
import { formatChampionPct } from "@/lib/format";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";

// 정규시즌 1위 ≠ 최종 우승(플레이오프) 인 리그 — "1위" 를 "정규시즌 1위" 로 구분 표기.
const PLAYOFF_LEAGUES = new Set(["NBA", "WNBA", "KBL", "WKBL", "KBO", "MLB", "NPB", "CPBL", "LMB", "MLS"]);

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

const INFO: Record<Lg, { name: string; relegationCount: number }> = {
  EPL: { name: "프리미어리그", relegationCount: 3 },
  LALIGA: { name: "라리가", relegationCount: 3 },
  BUNDESLIGA: { name: "분데스리가", relegationCount: 3 },
  SERIE_A: { name: "세리에 A", relegationCount: 3 },
  LIGUE_1: { name: "리그 1", relegationCount: 2 },
  MLS: { name: "MLS", relegationCount: 0 },
  UCL: { name: "챔피언스리그", relegationCount: 0 },
  NBA: { name: "NBA", relegationCount: 0 },
  NHL: { name: "NHL", relegationCount: 0 },
  MLB: { name: "MLB", relegationCount: 0 },
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
  // 올스타전 제외 — MLB All-Stars 가 순위표에 정규팀처럼 끼어든다
  const matches: PredictMatch[] = stripBaseballAllStarMatches(dbMatches).map((m) => ({ ...m }));

  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  if (finishedCount < 5) {
    return (
      <Link
        href={`/leagues/${league}`}
        className="group block rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
      >
        <div className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">
          {info.name}
        </div>
        <div className="mt-2 text-xs text-zinc-500 dark:text-white/45">
          데이터 수집 중 ({finishedCount}경기)
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
      iterations: 5000,
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
  const rankLabel = PLAYOFF_LEAGUES.has(league) ? "정규시즌 1위" : "1위";

  return (
    <Link
      href={`/leagues/${league}`}
      className="group block rounded-[1.25rem] bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
    >
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between">
          <div className="truncate text-sm font-semibold tracking-tight text-zinc-950 dark:text-white">
            {info.name}
          </div>
          <div className="ml-2 shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-white/35">
            {finishedCount}경기
          </div>
        </div>

        {/* 1위 */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-white/45">
            {rankLabel}
          </div>
          <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {nameById.get(top1.teamId) ?? "?"}
          </div>
          <div className="text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
            {top1.points}점 · Elo {Math.round(top1Elo)}
          </div>
        </div>

        {/* 우승 확률 */}
        {topChampPct && (
          <div className="border-t border-black/5 pt-2 dark:border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-white/45">
              우승 확률
            </div>
            <div className="flex items-baseline justify-between">
              <span className="truncate text-xs font-medium text-zinc-700 dark:text-white/80">
                {topChampPct.name}
              </span>
              <span className="text-base font-semibold tabular-nums text-zinc-950 dark:text-white">
                {formatChampionPct(topChampPct.pct / 100)}
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
