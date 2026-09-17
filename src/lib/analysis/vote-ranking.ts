// /experts 투표 랭킹 — 승부예측(MatchVote) 채점 결과를 회원별로 모아 적중률(윌슨 하한 정렬)·플랫 유닛 수익률·평균 CLV·현재 연속 적중을 낸다.
// 집계는 순수함수(aggregateVotes)로 두고 DB 조회만 getVoteRanking 이 맡는다.
import { prisma } from "@/lib/db";
import { settleFlatUnits, type FlatRoiResult } from "@/lib/predict/flat-roi";
import type { RankRow } from "@/lib/analysis/ranking";
import { wilsonLower } from "@/lib/analysis/wilson";

export type VotePeriod = "all" | "month";
/** 순위 산입 최소 채점 표 — /picks 랭킹과 같은 기준 */
export const VOTE_RANK_MIN = 3;

export interface VoteRankRow extends RankRow {
  roi: FlatRoiResult;
  /** 평균 CLV(%) — 픽 시점 배당이 종가보다 얼마나 좋았나. 표본 없으면 null */
  avgClv: number | null;
  clvN: number;
  /** 시장별 채점 수 — "승부 12 · 핸디 4" 보조 표기 */
  markets: Array<{ market: string; total: number; hit: number }>;
}

export interface VoteInput {
  userId: string;
  market: string;
  correct: boolean;
  pickOdds: number | null;
  clv: number | null;
  /** 채점 순서 기준(경기 시각). 연속 적중은 이 순서로 센다 */
  at: Date;
}

export interface VoteAgg {
  userId: string;
  total: number;
  hit: number;
  streak: number;
  roi: FlatRoiResult;
  avgClv: number | null;
  clvN: number;
  markets: Array<{ market: string; total: number; hit: number }>;
}

/** 회원별 집계 — 최소 표본 미만은 제외, 윌슨 하한 → 표본 순 정렬. */
export function aggregateVotes(votes: VoteInput[], minN = VOTE_RANK_MIN): VoteAgg[] {
  const byUser = new Map<string, VoteInput[]>();
  for (const v of votes) (byUser.get(v.userId) ?? byUser.set(v.userId, []).get(v.userId)!).push(v);
  const out: VoteAgg[] = [];
  for (const [userId, list] of byUser) {
    if (list.length < minN) continue;
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    let streak = 0;
    for (let i = list.length - 1; i >= 0 && list[i].correct; i--) streak++;
    const hit = list.filter((v) => v.correct).length;
    const clvRows = list.filter((v) => v.clv != null);
    const mk = new Map<string, { total: number; hit: number }>();
    for (const v of list) {
      const m = mk.get(v.market) ?? { total: 0, hit: 0 };
      m.total++;
      if (v.correct) m.hit++;
      mk.set(v.market, m);
    }
    out.push({
      userId,
      total: list.length,
      hit,
      streak,
      roi: settleFlatUnits(list.map((v) => ({ odds: v.pickOdds, won: v.correct }))),
      avgClv: clvRows.length ? (clvRows.reduce((a, v) => a + v.clv!, 0) / clvRows.length) * 100 : null,
      clvN: clvRows.length,
      markets: [...mk.entries()].map(([market, m]) => ({ market, ...m })),
    });
  }
  return out.sort((a, b) => wilsonLower(b.hit, b.total) - wilsonLower(a.hit, a.total) || b.total - a.total);
}

function monthStartUtc(): Date {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600_000);
}

export async function getVoteRanking(period: VotePeriod, limit = 100): Promise<VoteRankRow[]> {
  const votes = await prisma.matchVote.findMany({
    where: { userId: { not: null }, correct: { not: null }, ...(period === "month" ? { createdAt: { gte: monthStartUtc() } } : {}) },
    select: { userId: true, market: true, correct: true, pickOdds: true, clv: true, createdAt: true },
  });
  const aggs = aggregateVotes(
    votes.map((v) => ({ userId: v.userId!, market: v.market, correct: v.correct!, pickOdds: v.pickOdds, clv: v.clv, at: v.createdAt })),
  ).slice(0, limit);
  if (aggs.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: aggs.map((a) => a.userId) } },
    select: { id: true, nickname: true, level: true, badge: true, avatarUrl: true, nameColor: true, avatarFrame: true, title: true, favoriteTeam: { select: { logoUrl: true } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return aggs.flatMap((a) => {
    const u = byId.get(a.userId);
    if (!u) return [];
    return [{
      userId: a.userId, nickname: u.nickname, level: u.level, badge: u.badge,
      total: a.total, hit: a.hit, rate: Math.round((a.hit / a.total) * 100), streak: a.streak,
      avatarUrl: u.avatarUrl, nameColor: u.nameColor, avatarFrame: u.avatarFrame, title: u.title, favTeamLogo: u.favoriteTeam?.logoUrl ?? null,
      roi: a.roi, avgClv: a.avgClv, clvN: a.clvN, markets: a.markets,
    }];
  });
}
