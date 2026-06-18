// TheSports 캐시 기반 축구 매치 탭(라인업·팀통계·모멘텀·하프타임·H2H·골분포) 빌드.
// live 페이지 인라인 로직과 동등 — 글(article) 페이지가 같은 탭을 노출하도록 공용화.
// af 시즌스탯·배당·venue·WC예상라인업은 페이지 컨텍스트 의존이라 제외(글은 MatchInsight 가 배당 표시).
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import SoccerGoalDistributionCard from "@/components/scores/soccer/SoccerGoalDistributionCard";
import SoccerH2HCard from "@/components/scores/soccer/SoccerH2HCard";
import SoccerLineupSvg from "@/components/scores/soccer/SoccerLineupSvg";
import SoccerHalfTimeStatsCard from "@/components/scores/soccer/SoccerHalfTimeStatsCard";
import SoccerLiveStatsCard from "@/components/scores/soccer/SoccerLiveStatsCard";
import SoccerTeamStatsCard from "@/components/scores/soccer/SoccerTeamStatsCard";
import MatchTrendChart from "@/components/live/MatchTrendChart";
import GoalSceneViz, { type GoalLineGoal } from "@/components/charts/GoalSceneViz";

interface SoccerCacheLike {
  trend?: unknown;
  teamStats?: unknown;
  halfTeamStats?: unknown;
  lineup?: unknown;
  analysis?: unknown;
  detailLive?: unknown;
  goalLine?: unknown;
  fetchedAt: Date;
}

export interface SoccerInsightTab {
  key: string;
  label: string;
  enabled: boolean;
  content: ReactNode;
}

export async function buildSoccerCacheTabs(opts: {
  cache: SoccerCacheLike | null;
  status: string;
  homeKo: string;
  awayKo: string;
  homeTsId: string | null;
  awayTsId: string | null;
  homeScore: number | null;
  awayScore: number | null;
}): Promise<SoccerInsightTab[]> {
  const { cache, status, homeKo, awayKo, homeTsId, awayTsId, homeScore, awayScore } = opts;
  if (!cache) return [];

  // 라인업 선수 한글명 — TheSportsPlayer.nameKo (DB miss 시 SoccerLineupSvg 가 영문 fallback)
  const lineupNameById: Record<string, string> = {};
  const lineupRaw = cache.lineup as Parameters<typeof SoccerLineupSvg>[0]["data"] | null;
  if (lineupRaw?.lineup) {
    const lu = (lineupRaw as {
      lineup?: { home?: Record<string, { id?: string }>; away?: Record<string, { id?: string }> };
    }).lineup;
    const ids = new Set<string>();
    for (const side of [lu?.home, lu?.away]) {
      if (!side) continue;
      for (const p of Object.values(side)) {
        if (p?.id) ids.add(p.id);
      }
    }
    if (ids.size > 0) {
      const rows = await prisma.theSportsPlayer.findMany({
        where: { id: { in: Array.from(ids) }, nameKo: { not: null } },
        select: { id: true, nameKo: true },
      });
      for (const r of rows) if (r.nameKo) lineupNameById[r.id] = r.nameKo;
    }
  }

  const teamStats = cache.teamStats as Parameters<typeof SoccerTeamStatsCard>[0]["teamStats"] | null;
  const halfTeamStats = cache.halfTeamStats as Parameters<typeof SoccerHalfTimeStatsCard>[0]["halfTeamStats"] | null;
  const analysis = cache.analysis as {
    goal_distribution?: { home: unknown; away: unknown };
    history?: { vs?: unknown[] };
  } | null;
  const detailLive = cache.detailLive as {
    stats?: Array<{ type: number; home: number; away: number }>;
    incidents?: unknown;
  } | null;

  // LIVE 인데 캐시가 10분 이상 묵으면 모멘텀 숨김(stale 방지). 종료 경기는 항상 표시.
  const trendStale = status === "LIVE" && cache.fetchedAt.getTime() < Date.now() - 10 * 60 * 1000;
  const trend = trendStale ? null : (cache.trend as Parameters<typeof MatchTrendChart>[0]["trend"] | null);
  const gd = analysis?.goal_distribution;
  const h2h = analysis?.history?.vs ?? [];

  // MatchTrendChart 골 marker — detailLive incidents 중 스코어 변화 항목 (live 페이지와 동일 변환)
  const trendGoals = (() => {
    const incs = detailLive?.incidents;
    if (!Array.isArray(incs)) return null;
    return incs
      .filter(
        (i: Record<string, unknown>) =>
          typeof i.home_score === "number" || typeof i.away_score === "number",
      )
      .map((i: Record<string, unknown>) => ({
        minute: typeof i.add_time === "number" ? `${i.time}+${i.add_time}'` : `${i.time}'`,
        side: (i.position === 1 ? "home" : "away") as "home" | "away",
        player: typeof i.player_name === "string" ? i.player_name : "",
        ownGoal: false,
        penaltyKick: i.type === 17,
      }));
  })();

  const teamStatsNode =
    teamStats && Array.isArray(teamStats) && teamStats.length >= 2 ? (
      <SoccerTeamStatsCard
        teamStats={teamStats}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeTsTeamId={homeTsId}
        awayTsTeamId={awayTsId}
      />
    ) : detailLive?.stats && detailLive.stats.length > 0 ? (
      <SoccerLiveStatsCard stats={detailLive.stats} homeNameKo={homeKo} awayNameKo={awayKo} />
    ) : null;

  const halfTimeNode =
    halfTeamStats && (halfTeamStats.p1 || halfTeamStats.p2 || halfTeamStats.ft) ? (
      <SoccerHalfTimeStatsCard halfTeamStats={halfTeamStats} homeNameKo={homeKo} awayNameKo={awayKo} />
    ) : null;

  const trendNode =
    trend && Array.isArray(trend.data) && trend.data.length > 0 ? (
      <MatchTrendChart
        trend={trend}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeScore={homeScore}
        awayScore={awayScore}
        goals={trendGoals}
      />
    ) : null;

  const lineupNode =
    lineupRaw && lineupRaw.confirmed === 1 && lineupRaw.lineup ? (
      <SoccerLineupSvg data={lineupRaw} homeNameKo={homeKo} awayNameKo={awayKo} nameById={lineupNameById} />
    ) : null;

  const goalDistNode =
    gd && gd.home && gd.away ? (
      <SoccerGoalDistributionCard
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        data={gd as Parameters<typeof SoccerGoalDistributionCard>[0]["data"]}
      />
    ) : null;

  const h2hNode =
    h2h.length > 0 ? (
      <SoccerH2HCard
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeTsTeamId={homeTsId}
        awayTsTeamId={awayTsId}
        history={h2h}
      />
    ) : null;

  const goalLine = cache.goalLine as GoalLineGoal[] | null;
  const goalSceneNode =
    Array.isArray(goalLine) && goalLine.length > 0 ? (
      <GoalSceneViz goals={goalLine} homeName={homeKo} awayName={awayKo} />
    ) : null;

  const statsTab =
    teamStatsNode || halfTimeNode || trendNode ? (
      <div className="space-y-4">
        {teamStatsNode}
        {halfTimeNode}
        {trendNode}
      </div>
    ) : null;
  const h2hTab =
    h2hNode || goalDistNode ? (
      <div className="space-y-4">
        {h2hNode}
        {goalDistNode}
      </div>
    ) : null;

  return [
    { key: "soccer-lineup", label: "라인업", enabled: !!lineupNode, content: lineupNode },
    { key: "soccer-goalscene", label: "골 장면", enabled: !!goalSceneNode, content: goalSceneNode },
    { key: "soccer-stats", label: "팀 통계", enabled: !!statsTab, content: statsTab },
    { key: "soccer-h2h", label: "맞대결", enabled: !!h2hTab, content: h2hTab },
  ];
}
