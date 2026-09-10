// 개인 적중률 노트북 집계 — 회원이 즐겨찾기한 팀·리그에 대한 AI 예측 적중률(/account/hit-rate 단일 출처).
// 산식은 /predictions/accuracy 와 같다(predCorrect 채점 경기만, 시장별 rateOf, Strong 은 리그별 임계).

import { prisma } from "@/lib/db";
import { rateOf, statForLeague, type MarketRate, type LeagueStat } from "@/lib/predict/accuracy-stats";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { toKoreanTeamName } from "@/lib/team-names";
import type { AccSeriesPoint, AccLeagueMeta } from "@/components/charts/CumulativeAccuracyChart";

export interface TeamHitRate {
  teamId: number;
  name: string;
  league: string;
  sample: number;
  oneXTwo: MarketRate;
  over: MarketRate;
  hc: MarketRate;
  strong: MarketRate;
  /** 최근 10경기 1X2 적중 여부(최신 먼저). */
  recent: boolean[];
}

export interface RecentPick {
  matchId: number;
  league: string;
  startTime: Date;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** AI 1X2 픽을 팀명으로 — "무승부" 포함. */
  pick: string;
  correct: boolean;
}

export interface PersonalHitRate {
  teams: TeamHitRate[];
  leagues: LeagueStat[];
  recent: RecentPick[];
  /** 즐겨찾기 팀 전체 합산 1X2. */
  overall: MarketRate;
  chart: { points: AccSeriesPoint[]; leagues: AccLeagueMeta[] };
}

const TEAM_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export async function personalHitRate(userId: string): Promise<PersonalHitRate> {
  const [teamFollows, leagueFollows] = await Promise.all([
    prisma.userTeamFollow.findMany({ where: { userId }, select: { teamId: true } }),
    prisma.userLeagueFollow.findMany({ where: { userId }, select: { league: true } }),
  ]);
  const teamIds = [...new Set(teamFollows.map((f) => Number(f.teamId)).filter(Number.isFinite))];

  const [teams, matches, leagues] = await Promise.all([
    teamIds.length
      ? prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, league: true } })
      : Promise.resolve([]),
    teamIds.length
      ? prisma.match.findMany({
          where: { OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }], predCorrect: { not: null } },
          select: {
            id: true,
            league: true,
            startTime: true,
            homeTeamId: true,
            awayTeamId: true,
            homeScore: true,
            awayScore: true,
            predHome: true,
            predDraw: true,
            predAway: true,
            predWinner: true,
            predCorrect: true,
            predOverCorrect: true,
            predHcCorrect: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
          orderBy: { startTime: "desc" },
        })
      : Promise.resolve([]),
    Promise.all(leagueFollows.map((f) => statForLeague(f.league))),
  ]);

  const nameOf = (name: string, league: string) => toKoreanTeamName(name, league) || name;

  const teamStats: TeamHitRate[] = teams.map((t) => {
    const ms = matches.filter((m) => m.homeTeamId === t.id || m.awayTeamId === t.id);
    const threshold = strongPickThreshold(t.league);
    return {
      teamId: t.id,
      name: nameOf(t.name, t.league),
      league: t.league,
      sample: ms.length,
      oneXTwo: rateOf(ms.map((m) => ({ ok: m.predCorrect }))),
      over: rateOf(ms.map((m) => ({ ok: m.predOverCorrect }))),
      hc: rateOf(ms.map((m) => ({ ok: m.predHcCorrect }))),
      strong: rateOf(
        ms.filter((m) => Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0) >= threshold).map((m) => ({ ok: m.predCorrect })),
      ),
      recent: ms.slice(0, 10).map((m) => m.predCorrect === true),
    };
  });
  teamStats.sort((a, b) => b.sample - a.sample);

  // 누적 곡선 — 리그판(30경기 뒤 시작)보다 표본이 작아 10경기 뒤부터, 자격 10경기 이상.
  const RES = 100;
  const eligible = teamStats
    .filter((t) => t.sample >= 10)
    .map((t, i) => {
      const asc = matches.filter((m) => m.homeTeamId === t.teamId || m.awayTeamId === t.teamId).reverse();
      let correct = 0;
      const cum = asc.map((m) => (m.predCorrect ? ++correct : correct));
      const n = asc.length;
      const minIdx = Math.min(9, n - 1);
      const resampled = Array.from({ length: RES + 1 }, (_, k) => {
        const idx = Math.max(minIdx, Math.round((k / RES) * (n - 1)));
        return (cum[idx] / (idx + 1)) * 100;
      });
      return { t, color: TEAM_COLORS[i % TEAM_COLORS.length], resampled };
    });
  const points: AccSeriesPoint[] = Array.from({ length: RES + 1 }, (_, k) => {
    const row: AccSeriesPoint = { pct: k };
    for (const e of eligible) row[e.t.name] = Number(e.resampled[k].toFixed(1));
    return row;
  });

  const recent: RecentPick[] = matches.slice(0, 12).map((m) => {
    const home = nameOf(m.homeTeam.name, m.league);
    const away = nameOf(m.awayTeam.name, m.league);
    return {
      matchId: m.id,
      league: m.league,
      startTime: m.startTime,
      home,
      away,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      pick: m.predWinner === "HOME" ? home : m.predWinner === "AWAY" ? away : "무승부",
      correct: m.predCorrect === true,
    };
  });

  return {
    teams: teamStats,
    leagues,
    recent,
    overall: rateOf(matches.map((m) => ({ ok: m.predCorrect }))),
    chart: {
      points,
      leagues: eligible.map((e) => ({ key: String(e.t.teamId), name: e.t.name, color: e.color, sample: e.t.sample, finalRate: e.t.oneXTwo.rate * 100 })),
    },
  };
}
