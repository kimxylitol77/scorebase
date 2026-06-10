// POST /api/internal/thesports-cache
// Lightsail worker 가 TheSports football match data 를 캐시에 upsert.
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapFootballStatus, convertTsLineup } from "@/lib/sports/thesports/football-collector";
import { mapBaseballStatus, mapIceHockeyStatus, mapBasketballStatus } from "@/lib/sports/thesports/status-codes";
import { BASEBALL_LEAGUES, HOCKEY_LEAGUES, BASKETBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import type { MatchStatus } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match.status 단조 progression 가드 — FINISHED → SCHEDULED 같은 역행 차단.
// 단 POSTPONED 는 어디서나 진입 가능 (matchday cancel 케이스).
const STATUS_RANK: Record<MatchStatus, number> = {
  SCHEDULED: 0,
  LIVE: 1,
  FINISHED: 2,
  POSTPONED: 2,
};

interface Body {
  matchId: number;        // 우리 Match.id
  tsMatchId: string;      // thesports match id
  detailLive?: unknown;
  lineup?: unknown;
  analysis?: unknown;
  /** Match team statistics — match/team_stats/list 의 stats[] */
  teamStats?: unknown;
  /** Match player statistics — match/player_stats/list 의 player_stats[] */
  playerStats?: unknown;
  /** Match team half-time statistics — match/half/team_stats/list 응답
   *  구조: { p1: { stat_type_id: [home, away] }, ... } */
  halfTeamStats?: unknown;
  /** Match momentum trend — match/trend/detail 응답
   *  구조: { count, per, data: [[전반 값들], [후반 값들]] } */
  trend?: unknown;
  /** football fast-poller 가 detailLive 에서 추출한 score — DB.Match 도 함께 update.
   *  /scores 목록 SSR 이 즉시 fresh 받도록. */
  homeScore?: number;
  awayScore?: number;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.matchId !== "number" || typeof body.tsMatchId !== "string") {
    return NextResponse.json({ error: "matchId(number) + tsMatchId(string) required" }, { status: 400 });
  }

  // 우리 Match 존재 확인 + 기존 cache 의 detailLive 가져오기 (merge 용)
  const [existing, currentMatch] = await Promise.all([
    prisma.theSportsMatchCache.findUnique({
      where: { matchId: body.matchId },
      select: { matchId: true, detailLive: true },
    }),
    prisma.match.findUnique({
      where: { id: body.matchId },
      select: {
        id: true, homeScore: true, awayScore: true, status: true, league: true, startTime: true,
        lineupHome: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    }),
  ]);
  if (!currentMatch) return NextResponse.json({ error: "match not found" }, { status: 404 });

  // POSTPONED 매치는 worker push 전부 무시 — cache.updatedAt freshness false positive 방지.
  // baseball-poller / ws-subscriber 가 우천 연기 후에도 detailLive 를 계속 push 해
  // LiveScoresBar 가 stale 라이브로 오인하는 케이스 차단 (2026-05-27 한화 vs NC 사고).
  // 운영자가 POSTPONED 를 풀거나 api-football cron 이 재편성된 매치로 새 row 만들면
  // 그때부터 다시 라이브 데이터 받기 시작.
  if (currentMatch.status === "POSTPONED") {
    return NextResponse.json({ ok: true, skipped: "postponed" });
  }

  // upsert — 매치당 1 row
  // 모든 JSON 필드는 undefined 면 갱신 안 함 (부분 update)
  const data: Record<string, unknown> = { tsMatchId: body.tsMatchId };
  // detailLive 는 통째 replace 대신 기존 키들과 merge — ws-subscriber 가 partial
  // delta (extra 만 / score 만 등) 푸시할 때 다른 키 (score/stats/players) 보존 위해.
  // football fast-poller 처럼 전체 응답 푸시도 동일 merge 결과로 안전.
  if (body.detailLive !== undefined) {
    const cur = (existing?.detailLive as Record<string, unknown> | null) ?? {};
    const incoming = (body.detailLive as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...cur, ...incoming };
    // 야구 score = [id, statusId, half, {ft,p1..pN,h,e}]. MQTT delta 는 점수만 바뀐
    // push 에서 score[3] 에 {ft,p5} 처럼 일부 키만 담아 보냄 → score 통째 교체 시
    // 이닝별(p1~pN)·안타(h)·실책(e) 소실 → 화면 이닝칸 공백 (2026-06-04 KBO 한화:두산).
    // score[3] 만 기존과 deep merge 해 이닝 데이터 보존 (sid/half=score[1],[2]는 최신 유지).
    // football·농구의 score[3] 는 배열이므로 !Array.isArray 가드로 야구(plain object)만 처리.
    const curScore = cur.score;
    const inScore = incoming.score;
    if (
      Array.isArray(inScore) &&
      Array.isArray(curScore) &&
      inScore.length >= 4 &&
      curScore.length >= 4 &&
      inScore[3] != null &&
      typeof inScore[3] === "object" &&
      !Array.isArray(inScore[3]) &&
      curScore[3] != null &&
      typeof curScore[3] === "object" &&
      !Array.isArray(curScore[3])
    ) {
      const mergedScore = [...inScore];
      mergedScore[3] = {
        ...(curScore[3] as Record<string, unknown>),
        ...(inScore[3] as Record<string, unknown>),
      };
      merged.score = mergedScore;
    }
    data.detailLive = merged;
  }
  if (body.lineup !== undefined) data.lineup = body.lineup as object;
  if (body.analysis !== undefined) data.analysis = body.analysis as object;
  if (body.teamStats !== undefined) data.teamStats = body.teamStats as object;
  if (body.playerStats !== undefined) data.playerStats = body.playerStats as object;
  if (body.halfTeamStats !== undefined) data.halfTeamStats = body.halfTeamStats as object;
  if (body.trend !== undefined) data.trend = body.trend as object;

  const cache = await prisma.theSportsMatchCache.upsert({
    where: { matchId: body.matchId },
    create: {
      matchId: body.matchId,
      tsMatchId: body.tsMatchId,
      detailLive: (body.detailLive ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      lineup: (body.lineup ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      analysis: (body.analysis ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      teamStats: (body.teamStats ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      playerStats: (body.playerStats ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      halfTeamStats: (body.halfTeamStats ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      trend: (body.trend ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
    update: data,
    select: { id: true, matchId: true, updatedAt: true },
  });

  // detailLive.score[1] = TheSports status_id. sport 별 mapping 으로 우리 MatchStatus 추출.
  // (2026-05-24 옵션 A: cache → Match 동기화 — api-football cron 누락 매치도 worker push 로
  //  status 자동 갱신. 단조 progression 가드로 역행 차단.)
  const scoreArr = (body.detailLive as { score?: unknown[] } | null)?.score;
  const tsStatusId =
    Array.isArray(scoreArr) && typeof scoreArr[1] === "number"
      ? (scoreArr[1] as number)
      : null;

  // football fast-poller 가 score 보냈으면 Match 의 homeScore/awayScore 도 동시 update.
  // status 도 함께 (cache → Match 동기화). monotonic max — 점수 줄어들지 않게 안전망.
  let matchUpdated = false;
  const needScoreUpdate =
    typeof body.homeScore === "number" && typeof body.awayScore === "number";
  if (needScoreUpdate || tsStatusId != null) {
    try {
      const updateData: { homeScore?: number; awayScore?: number; status?: MatchStatus } = {};

      if (needScoreUpdate) {
        // 야구는 챌린지/판정 정정으로 점수 감소 가능 → ws-subscriber 의 fresh ft 그대로 set.
        // 축구는 monotonic max 유지 (점수 감소 시나리오 거의 없음 + race 안전망).
        const isBaseball = BASEBALL_LEAGUES.has(currentMatch.league);
        const newHome = isBaseball
          ? body.homeScore!
          : Math.max(body.homeScore!, currentMatch.homeScore ?? -1);
        const newAway = isBaseball
          ? body.awayScore!
          : Math.max(body.awayScore!, currentMatch.awayScore ?? -1);
        if (newHome !== currentMatch.homeScore) updateData.homeScore = newHome;
        if (newAway !== currentMatch.awayScore) updateData.awayScore = newAway;
      }

      if (tsStatusId != null) {
        const mapped = BASEBALL_LEAGUES.has(currentMatch.league)
          ? mapBaseballStatus(tsStatusId)
          : HOCKEY_LEAGUES.has(currentMatch.league)
            ? mapIceHockeyStatus(tsStatusId)
            : BASKETBALL_LEAGUES.has(currentMatch.league)
              ? mapBasketballStatus(tsStatusId)
              : mapFootballStatus(tsStatusId);
        // 단조 progression — FINISHED 에서 LIVE/SCHEDULED 로 역행 안 함.
        // POSTPONED 는 어디서나 진입 허용 (matchday cancel).
        const currentRank = STATUS_RANK[currentMatch.status as MatchStatus] ?? 0;
        const newRank = STATUS_RANK[mapped];
        // 미래 매치 가드 — 킥오프 10분 전보다 이른 매치는 LIVE/FINISHED 로 안 바꿈.
        // ts cache 오연결(진행 중 다른 경기의 status_id)이 미래 예정 매치를 LIVE 로
        // 오염시키던 사고 차단 (2026-05-29 EGYPT_PL #144999 — 2h 후 매치가 LIVE).
        const isFutureMatch =
          currentMatch.startTime.getTime() > Date.now() + 10 * 60 * 1000;
        const blockByFuture =
          isFutureMatch && (mapped === "LIVE" || mapped === "FINISHED");
        if (
          mapped !== currentMatch.status &&
          (newRank >= currentRank || mapped === "POSTPONED") &&
          !blockByFuture
        ) {
          updateData.status = mapped;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.match.update({ where: { id: body.matchId }, data: updateData });
        matchUpdated = true;
      }
    } catch {
      // Match update 실패 ignore — cache 는 이미 저장
    }
  }

  // ===== TheSports lineup → Match.lineupHome/away 동기화 (2026-06-10) =====
  // 확장 리그(ts- 매치)는 api-football cron 이 라인업을 못 채움 — worker 가 push 한
  // cache.lineup 을 af FixtureLineup 계약으로 변환해 저장 (RECAP/PREVIEW 글·챗봇 소비).
  // confirmed=1 공식 라인업만, 축구만, 비어 있을 때만 (af 가 이미 채운 매치는 유지).
  let lineupSynced = false;
  const isFootball =
    !BASEBALL_LEAGUES.has(currentMatch.league) &&
    !HOCKEY_LEAGUES.has(currentMatch.league) &&
    !BASKETBALL_LEAGUES.has(currentMatch.league);
  if (body.lineup && isFootball && currentMatch.lineupHome == null) {
    const conv = convertTsLineup(
      body.lineup,
      currentMatch.homeTeam.name,
      currentMatch.awayTeam.name,
    );
    if (conv) {
      try {
        await prisma.match.update({
          where: { id: body.matchId },
          data: {
            lineupHome: JSON.stringify(conv.home),
            lineupAway: JSON.stringify(conv.away),
            lineupUpdatedAt: new Date(),
          },
        });
        lineupSynced = true;
      } catch {
        // Match update 실패 ignore — cache 는 저장됨, 다음 worker push 가 재시도
      }
    }
  }

  return NextResponse.json({ ok: true, cache, matchUpdated, lineupSynced });
}
