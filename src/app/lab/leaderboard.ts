// /lab 봇 리더보드 집계 — MemberBotPick 채점 결과(correct)를 기간별(7일/30일/전체)로 봇당 합산. 읽기 전용.
import { prisma } from "@/lib/db";

/** 순위 산입 최소 채점 표본 — 표본 부족 봇의 순위 왜곡 방지 (v1 설계 메모의 n≥20 가드) */
export const LEADERBOARD_MIN_N = 20;

export type LeaderboardPeriod = "d7" | "d30" | "all";

export interface LeaderboardBot {
  botId: string;
  name: string;
  league: string; // "ALL" 또는 리그 코드
  owner: string; // 소유 회원 닉네임 (공개 정보만 — 이메일 등 조회 금지)
  stats: Record<LeaderboardPeriod, { n: number; hits: number }>;
}

interface RawRow {
  botId: string;
  n7: bigint;
  h7: bigint;
  n30: bigint;
  h30: bigint;
  nall: bigint;
  hall: bigint;
}

/** 채점 완료(1X2) 픽을 봇별·기간별로 집계. 기간 기준은 픽 생성일(createdAt ≈ 경기일). */
export async function loadBotLeaderboard(): Promise<LeaderboardBot[]> {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT p."botId",
      COUNT(*) FILTER (WHERE p."createdAt" >= now() - interval '7 days')            AS n7,
      COUNT(*) FILTER (WHERE p.correct AND p."createdAt" >= now() - interval '7 days')  AS h7,
      COUNT(*) FILTER (WHERE p."createdAt" >= now() - interval '30 days')           AS n30,
      COUNT(*) FILTER (WHERE p.correct AND p."createdAt" >= now() - interval '30 days') AS h30,
      COUNT(*)                                                                      AS nall,
      COUNT(*) FILTER (WHERE p.correct)                                             AS hall
    FROM "MemberBotPick" p
    WHERE p.correct IS NOT NULL AND p.market = '1X2'
    GROUP BY p."botId"`;
  if (rows.length === 0) return [];

  // MemberBot·User 는 FK 없는 manual join 설계 — 이름·닉네임만 별도 조회
  const bots = await prisma.memberBot.findMany({
    where: { id: { in: rows.map((r) => r.botId) } },
    select: { id: true, name: true, league: true, userId: true },
  });
  const botMap = new Map(bots.map((b) => [b.id, b]));
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(bots.map((b) => b.userId))] } },
    select: { id: true, nickname: true },
  });
  const nickMap = new Map(users.map((u) => [u.id, u.nickname]));

  const result: LeaderboardBot[] = [];
  for (const r of rows) {
    const bot = botMap.get(r.botId);
    if (!bot) continue; // 삭제된 봇의 잔존 픽(cascade 이전 이력) 방어
    result.push({
      botId: bot.id,
      name: bot.name,
      league: bot.league,
      owner: nickMap.get(bot.userId) ?? "탈퇴 회원",
      stats: {
        d7: { n: Number(r.n7), hits: Number(r.h7) },
        d30: { n: Number(r.n30), hits: Number(r.h30) },
        all: { n: Number(r.nall), hits: Number(r.hall) },
      },
    });
  }
  return result;
}
