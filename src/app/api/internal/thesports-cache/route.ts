// POST /api/internal/thesports-cache
// Lightsail worker 가 TheSports football match data 를 캐시에 upsert.
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mapFootballStatus } from "@/lib/sports/thesports/football-collector";
import { mapBaseballStatus } from "@/lib/sports/thesports/status-codes";
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

const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);

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

  // 우리 Match 존재 확인
  const exists = await prisma.match.findUnique({ where: { id: body.matchId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "match not found" }, { status: 404 });

  // upsert — 매치당 1 row
  // 모든 JSON 필드는 undefined 면 갱신 안 함 (부분 update)
  const data: Record<string, unknown> = { tsMatchId: body.tsMatchId };
  if (body.detailLive !== undefined) data.detailLive = body.detailLive as object;
  if (body.lineup !== undefined) data.lineup = body.lineup as object;
  if (body.analysis !== undefined) data.analysis = body.analysis as object;
  if (body.teamStats !== undefined) data.teamStats = body.teamStats as object;
  if (body.playerStats !== undefined) data.playerStats = body.playerStats as object;
  if (body.halfTeamStats !== undefined) data.halfTeamStats = body.halfTeamStats as object;

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
      const current = await prisma.match.findUnique({
        where: { id: body.matchId },
        select: { homeScore: true, awayScore: true, status: true, league: true },
      });
      const updateData: { homeScore?: number; awayScore?: number; status?: MatchStatus } = {};

      if (needScoreUpdate && current) {
        // 야구는 챌린지/판정 정정으로 점수 감소 가능 → ws-subscriber 의 fresh ft 그대로 set.
        // 축구는 monotonic max 유지 (점수 감소 시나리오 거의 없음 + race 안전망).
        const isBaseball = BASEBALL_LEAGUES.has(current.league);
        const newHome = isBaseball
          ? body.homeScore!
          : Math.max(body.homeScore!, current.homeScore ?? -1);
        const newAway = isBaseball
          ? body.awayScore!
          : Math.max(body.awayScore!, current.awayScore ?? -1);
        if (newHome !== current.homeScore) updateData.homeScore = newHome;
        if (newAway !== current.awayScore) updateData.awayScore = newAway;
      }

      if (tsStatusId != null && current) {
        const sport = BASEBALL_LEAGUES.has(current.league) ? "baseball" : "football";
        const mapped =
          sport === "baseball"
            ? mapBaseballStatus(tsStatusId)
            : mapFootballStatus(tsStatusId);
        // 단조 progression — FINISHED 에서 LIVE/SCHEDULED 로 역행 안 함.
        // POSTPONED 는 어디서나 진입 허용 (matchday cancel).
        const currentRank = STATUS_RANK[current.status as MatchStatus] ?? 0;
        const newRank = STATUS_RANK[mapped];
        if (mapped !== current.status && (newRank >= currentRank || mapped === "POSTPONED")) {
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

  return NextResponse.json({ ok: true, cache, matchUpdated });
}
