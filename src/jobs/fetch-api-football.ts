// API-Football Pro 데이터 통합 잡.
// 1) 향후 24시간 SCHEDULED 매치: fixture ID 매칭 + 라인업 + 자체 predictions
// 2) 최근 36시간 FINISHED 매치 중 fixtureStats 미저장: 통계 fetch + 적중 평가
//
// 사용: npm run job:af  (cron 등록은 /api/cron/api-football)

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  findFixtureByDateAndTeams,
  fetchFixtureLineups,
  fetchFixtureStatistics,
  fetchFixturePredictions,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";

const SOCCER_LEAGUES = Object.keys(API_FOOTBALL_LEAGUE_ID);

export async function runApiFootball(opts?: { limit?: number }) {
  const limit = opts?.limit ?? 80;
  console.log("[af] 시작");

  // ===== Phase 1: 향후 24h SCHEDULED 매치 — 라인업 + predictions =====
  const upcoming = await prisma.match.findMany({
    where: {
      league: { in: SOCCER_LEAGUES },
      status: "SCHEDULED",
      startTime: {
        gte: new Date(),
        lte: new Date(Date.now() + 24 * 3600 * 1000),
      },
    },
    include: { homeTeam: true, awayTeam: true },
    take: limit,
  });
  console.log(`[af/upcoming] 대상: ${upcoming.length}`);
  let lineupCount = 0;
  let predCount = 0;
  for (const m of upcoming) {
    let fid = m.apiFixtureId ?? null;
    if (!fid) {
      fid = await findFixtureByDateAndTeams(
        m.league,
        m.startTime,
        m.homeTeam.name,
        m.awayTeam.name,
      );
      if (!fid) continue;
      await prisma.match.update({
        where: { id: m.id },
        data: { apiFixtureId: fid },
      });
    }
    const data: Record<string, unknown> = {};
    // 라인업 (1시간 전부터 발표)
    if (!m.lineupUpdatedAt || Date.now() - m.lineupUpdatedAt.getTime() > 30 * 60 * 1000) {
      const lineups = await fetchFixtureLineups(fid);
      const home = lineups.find((l) => l.teamName === m.homeTeam.name) ?? lineups[0];
      const away = lineups.find((l) => l.teamName === m.awayTeam.name) ?? lineups[1];
      if (home) {
        data.lineupHome = JSON.stringify(home);
        data.lineupUpdatedAt = new Date();
        lineupCount++;
      }
      if (away) data.lineupAway = JSON.stringify(away);
    }
    // API-Football 자체 prediction
    if (m.apiPredHome == null) {
      const pred = await fetchFixturePredictions(fid);
      if (pred) {
        data.apiPredHome = pred.homePct;
        data.apiPredDraw = pred.drawPct;
        data.apiPredAway = pred.awayPct;
        data.apiPredWinner = pred.winner;
        data.apiPredAdvice = pred.advice ?? null;
        predCount++;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.match.update({ where: { id: m.id }, data });
    }
  }
  console.log(`[af/upcoming] 라인업 ${lineupCount}건, predictions ${predCount}건`);

  // ===== Phase 2: 최근 36h FINISHED 매치 — fixture statistics =====
  const recent = await prisma.match.findMany({
    where: {
      league: { in: SOCCER_LEAGUES },
      status: "FINISHED",
      startTime: { gte: new Date(Date.now() - 36 * 3600 * 1000) },
      fixtureStats: null,
    },
    include: { homeTeam: true, awayTeam: true },
    take: limit,
  });
  console.log(`[af/stats] 대상: ${recent.length}`);
  let statsCount = 0;
  for (const m of recent) {
    let fid = m.apiFixtureId ?? null;
    if (!fid) {
      fid = await findFixtureByDateAndTeams(
        m.league,
        m.startTime,
        m.homeTeam.name,
        m.awayTeam.name,
      );
      if (!fid) continue;
      await prisma.match.update({
        where: { id: m.id },
        data: { apiFixtureId: fid },
      });
    }
    const stats = await fetchFixtureStatistics(fid);
    if (stats.length > 0) {
      // API-Football 자체 prediction 적중 평가도 같이
      const data: Record<string, unknown> = {
        fixtureStats: JSON.stringify(stats),
      };
      if (m.apiPredWinner && m.homeScore != null && m.awayScore != null) {
        const actual =
          m.homeScore > m.awayScore
            ? "HOME"
            : m.awayScore > m.homeScore
              ? "AWAY"
              : "DRAW";
        data.apiPredCorrect = m.apiPredWinner === actual;
      }
      await prisma.match.update({ where: { id: m.id }, data });
      statsCount++;
    }
  }
  console.log(`[af/stats] ${statsCount}건 통계 저장`);

  return { lineupCount, predCount, statsCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runApiFootball()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
