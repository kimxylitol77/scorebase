// 적중률 랭킹 — 전체(User 누적 캐시) / 월간(이번 달 채점된 Post 집계).
// 정렬: 적중률 desc → 적중수 desc → 경기수 desc.

import "server-only";
import { prisma } from "@/lib/db";
import { hitRate } from "@/lib/analysis/format";

export interface RankRow {
  userId: string;
  nickname: string;
  level: number;
  badge: string | null;
  total: number;
  hit: number;
  rate: number;
  streak: number;
}

function byRate(a: RankRow, b: RankRow): number {
  return b.rate - a.rate || b.hit - a.hit || b.total - a.total;
}

/** 전체 랭킹 — User 누적 통계(predTotal/predHit). 1건 이상 채점된 회원만. */
export async function getOverallRanking(limit = 50): Promise<RankRow[]> {
  const users = await prisma.user.findMany({
    where: { predTotal: { gt: 0 } },
    select: {
      id: true,
      nickname: true,
      level: true,
      badge: true,
      predTotal: true,
      predHit: true,
      predStreak: true,
    },
    take: 300,
  });
  return users
    .map((u) => ({
      userId: u.id,
      nickname: u.nickname,
      level: u.level,
      badge: u.badge,
      total: u.predTotal,
      hit: u.predHit,
      streak: u.predStreak,
      rate: hitRate(u.predHit, u.predTotal),
    }))
    .sort(byRate)
    .slice(0, limit);
}

/** 이번 달(KST) 시작 시각 → UTC Date. */
function monthStartUtc(): Date {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const startMs = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1, 0, 0, 0);
  return new Date(startMs - 9 * 60 * 60 * 1000);
}

/** 월간 랭킹 — 이번 달 채점된(settledAt) 예측글 집계. */
export async function getMonthlyRanking(limit = 50): Promise<RankRow[]> {
  const since = monthStartUtc();
  const [totals, hits] = await Promise.all([
    prisma.post.groupBy({
      by: ["authorId"],
      where: { settledAt: { gte: since }, isCorrect: { not: null } },
      _count: { _all: true },
    }),
    prisma.post.groupBy({
      by: ["authorId"],
      where: { settledAt: { gte: since }, isCorrect: true },
      _count: { _all: true },
    }),
  ]);
  if (totals.length === 0) return [];

  const hitMap = new Map(hits.map((h) => [h.authorId, h._count._all]));
  const users = await prisma.user.findMany({
    where: { id: { in: totals.map((t) => t.authorId) } },
    select: { id: true, nickname: true, level: true, badge: true, predStreak: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return totals
    .map((t) => {
      const u = userMap.get(t.authorId);
      const total = t._count._all;
      const hit = hitMap.get(t.authorId) ?? 0;
      return {
        userId: t.authorId,
        nickname: u?.nickname ?? "(탈퇴)",
        level: u?.level ?? 1,
        badge: u?.badge ?? null,
        total,
        hit,
        streak: u?.predStreak ?? 0,
        rate: hitRate(hit, total),
      };
    })
    .sort(byRate)
    .slice(0, limit);
}
