// API-Football Pro 데이터 통합 잡 — **af 고유 데이터만** (쿼터 절약, 2026-07 제한).
// 라인업은 TheSports 가 primary(convertTsLineup·football-poller). 다만 ts 가 아예 안 주는
// 경기가 상당수라 킥오프 근처 매치만 af 로 메운다(Phase 1.5) — 2026-08-17 실측: 축구 LIVE
// 58경기 중 28경기가 라인업 없음, apiFixtureId 보유 10건을 af 에 물으니 6건은 af 에 있었다.
// af 만 가진 것: ① 매치 예측 %(apiPred*) ② fixtureStats(xG·점유) ③ 주심.
// 1) 향후 24h SCHEDULED: fixture ID 매칭 + 예측
// 1.5) 킥오프 ±3h 인데 라인업 결손: af 라인업 폴백
// 2) 최근 36h FINISHED (fixtureStats 미저장): 통계 fetch + 예측 적중 평가
// 3) 주심 보강
//
// 사용: npm run job:af  (cron 등록은 /api/cron/api-football)

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  findFixtureByDateAndTeams,
  fetchFixtureLineups,
  fetchFixtureStatistics,
  fetchFixturePredictions,
  fetchFixtureReferee,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";

// CLUB_FRIENDLY(프리시즌 클럽 친선)는 스코어 피드 전용 — 라인업·예측 보강 제외(quota 절약).
const SOCCER_LEAGUES = Object.keys(API_FOOTBALL_LEAGUE_ID).filter(
  (l) => l !== "CLUB_FRIENDLY",
);

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
  let predCount = 0;
  for (const m of upcoming) {
    // 예측이 이미 있으면 fixture 매칭 콜조차 생략 (예측만 af 고유라 이거 없으면 af 볼 이유 없음).
    if (m.apiPredHome != null) continue;
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
    // API-Football 자체 prediction (af 고유)
    const pred = await fetchFixturePredictions(fid);
    if (pred) {
      await prisma.match.update({
        where: { id: m.id },
        data: {
          apiPredHome: pred.homePct,
          apiPredDraw: pred.drawPct,
          apiPredAway: pred.awayPct,
          apiPredWinner: pred.winner,
          apiPredAdvice: pred.advice ?? null,
        },
      });
      predCount++;
    }
  }
  console.log(`[af/upcoming] predictions ${predCount}건`);

  // ===== Phase 1.5: 킥오프 ±3h 인데 라인업이 없는 매치 — af 라인업 폴백 =====
  // ts(football-poller)가 primary 지만 소스가 아예 안 주는 경기가 절반 가까이 된다.
  // 대상을 킥오프 근처 + apiFixtureId 보유로 좁혀 쿼터 부담을 낮춘다(실측 10건 안팎/회).
  // ⚠️ af 응답의 홈팀 순서는 보장되지 않는다 — 반드시 team.id 로 가른다(af-lineup-backfill-traps).
  const LINEUP_WINDOW_MS = 3 * 3600 * 1000;
  const needLineup = await prisma.match.findMany({
    where: {
      league: { in: SOCCER_LEAGUES },
      lineupHome: null,
      apiFixtureId: { not: null },
      startTime: {
        gte: new Date(Date.now() - LINEUP_WINDOW_MS),
        lte: new Date(Date.now() + LINEUP_WINDOW_MS),
      },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: limit,
  });
  console.log(`[af/lineup] 대상: ${needLineup.length}`);
  // Team.externalId 가 af id 라는 보장이 없다 — ESPN 소스 리그(빅5 다수)는 거기에 ESPN id 가
  // 들어 있고 af id 는 TeamSourceId 에만 있다(라리가 비야레알 externalId=102·af=533 실측).
  // externalId 만 믿으면 정작 노출 큰 리그에서 홈/원정을 못 갈라 통째로 건너뛴다.
  const lineupTeamIds = [
    ...new Set(needLineup.flatMap((m) => [m.homeTeam.id, m.awayTeam.id])),
  ];
  const afSources = lineupTeamIds.length
    ? await prisma.teamSourceId.findMany({
        where: { teamId: { in: lineupTeamIds }, source: "api-football" },
        select: { teamId: true, externalId: true },
      })
    : [];
  const afIdByTeam = new Map<number, string>();
  for (const s of afSources) if (!afIdByTeam.has(s.teamId)) afIdByTeam.set(s.teamId, s.externalId);
  const afIdOf = (t: { id: number; externalId: string | null }) =>
    afIdByTeam.get(t.id) ?? t.externalId;

  let lineupCount = 0;
  for (const m of needLineup) {
    const rows = await fetchFixtureLineups(m.apiFixtureId!);
    if (rows.length < 2) continue;
    const byAfId = (extId: string | null) =>
      extId ? rows.find((r) => String(r.teamId) === extId) : undefined;
    const home = byAfId(afIdOf(m.homeTeam));
    const away = byAfId(afIdOf(m.awayTeam));
    // id 로 못 가르면 버린다 — 이름 추측으로 홈/원정을 뒤집으면 라인업 자체가 오정보가 된다.
    if (!home || !away || home === away) continue;
    // ts 변환(convertTsLineup)과 같은 기준 — 선발 11명이 다 차야 저장.
    if (home.startXI.length < 11 || away.startXI.length < 11) continue;
    await prisma.match.update({
      where: { id: m.id },
      data: {
        lineupHome: JSON.stringify({
          teamName: home.teamName,
          formation: home.formation,
          startXI: home.startXI,
        }),
        lineupAway: JSON.stringify({
          teamName: away.teamName,
          formation: away.formation,
          startXI: away.startXI,
        }),
        lineupUpdatedAt: new Date(),
      },
    });
    lineupCount++;
  }
  console.log(`[af/lineup] ${lineupCount}건 보강`);

  // ===== Phase 2: 최근 36h FINISHED 매치 — fixture statistics(xG·점유, af 고유) + 예측 적중 평가 =====
  // 라인업 사후 보강은 TheSports(convertTsLineup)가 담당 → 여기서 제외.
  const recent = await prisma.match.findMany({
    where: {
      league: { in: SOCCER_LEAGUES },
      status: "FINISHED",
      startTime: { gte: new Date(Date.now() - 36 * 3600 * 1000) },
      // fixtureStats 미저장 또는 예측 채점 대기 매치만.
      OR: [{ fixtureStats: null }, { apiPredWinner: { not: null }, apiPredCorrect: null }],
    },
    include: { homeTeam: true, awayTeam: true },
    take: limit,
  });
  console.log(`[af/stats] 대상: ${recent.length}`);
  let statsCount = 0;
  for (const m of recent) {
    const data: Record<string, unknown> = {};
    // fixtureStats — af fetch 필요 (fixture id 있을 때만; 없으면 매칭 콜 아껴 스킵).
    if (!m.fixtureStats && m.apiFixtureId) {
      const stats = await fetchFixtureStatistics(m.apiFixtureId);
      if (stats.length > 0) {
        data.fixtureStats = JSON.stringify(stats);
        statsCount++;
      }
    }
    // API-Football prediction 적중 평가 (DB 값만, af 콜 없음)
    if (m.apiPredWinner && m.homeScore != null && m.awayScore != null && m.apiPredCorrect == null) {
      const actual =
        m.homeScore > m.awayScore
          ? "HOME"
          : m.awayScore > m.homeScore
            ? "AWAY"
            : "DRAW";
      data.apiPredCorrect = m.apiPredWinner === actual;
    }
    if (Object.keys(data).length > 0) {
      await prisma.match.update({ where: { id: m.id }, data });
    }
  }
  console.log(`[af/stats] ${statsCount}건 통계 저장`);

  // ===== Phase 3: 주심 보강 — collect raw 에 referee 가 없는 축구 매치 (ESPN 6리그 등) =====
  // referee 미저장 + apiFixtureId 보유 + 최근 14일~향후 3일 매치만 (오래된 매치 무한 재조회 방지).
  // af 소스 리그는 collect 에서 이미 채워 referee != null → 자동 제외.
  const noRef = await prisma.match.findMany({
    where: {
      league: { in: SOCCER_LEAGUES },
      referee: null,
      apiFixtureId: { not: null },
      startTime: {
        gte: new Date(Date.now() - 14 * 24 * 3600 * 1000),
        lte: new Date(Date.now() + 3 * 24 * 3600 * 1000),
      },
    },
    take: limit,
  });
  let refereeCount = 0;
  for (const m of noRef) {
    const ref = await fetchFixtureReferee(m.apiFixtureId!);
    if (ref) {
      await prisma.match.update({ where: { id: m.id }, data: { referee: ref } });
      refereeCount++;
    }
  }
  console.log(`[af/referee] ${refereeCount}건 주심 보강 (대상 ${noRef.length})`);

  return { predCount, statsCount, refereeCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runApiFootball()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
