// 분석가 개인 프로필 데이터 — 헤더 통계 / 리그별 정확도 / 예측 이력.
//   - 전체 통계는 User 누적 캐시(predTotal/predHit/predStreak/predBest, scoring.ts 가 채움).
//   - 리그별·이력은 Post(예측 1건)를 match 관계로 join. 개인 1명이라 표본 수십~수백 → in-memory 집계.

import "server-only";
import type { Prisma } from "@prisma/client";
import type { AvatarPreset } from "@/lib/avatars";
import { prisma } from "@/lib/db";
import { hitRate } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { wilsonLower, getOverallRanking } from "@/lib/analysis/ranking";
import { resolveAvatar, analystIntro } from "@/lib/analysis/analysts";
import { pickLabel } from "@/lib/analysis/pick-label";
import { toKoreanTeamName } from "@/lib/team-names";

export const PROFILE_PAGE_SIZE = 20;

export interface UserProfile {
  userId: string;
  nickname: string;
  level: number;
  badge: string | null;
  avatar: AvatarPreset;
  intro: string;
  total: number;
  hit: number;
  rate: number;
  streak: number;
  best: number;
  rank: number | null; // 전체 랭킹 순위(1-based), 300위 밖이면 null
  fans: number; // MVP 더미(팔로우 2차)
}

/** 닉네임 해시 기반 안정 더미 fans (매 새로고침 동일). 팔로우 구현 시 교체. */
function dummyFans(nickname: string): number {
  let h = 0;
  for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0;
  return 20 + (h % 480); // 20~499
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nickname: true,
      level: true,
      badge: true,
      avatarUrl: true,
      predTotal: true,
      predHit: true,
      predStreak: true,
      predBest: true,
    },
  });
  if (!u) return null;

  // 순위 — 전체 랭킹(300위까지)에서 위치. 이미 정렬된 배열 재사용.
  const ranking = await getOverallRanking(300);
  const idx = ranking.findIndex((r) => r.userId === userId);

  return {
    userId: u.id,
    nickname: u.nickname,
    level: u.level,
    badge: u.badge,
    avatar: resolveAvatar(u.avatarUrl, u.nickname),
    intro: analystIntro(u.nickname),
    total: u.predTotal,
    hit: u.predHit,
    rate: hitRate(u.predHit, u.predTotal),
    streak: u.predStreak,
    best: u.predBest,
    rank: idx >= 0 ? idx + 1 : null,
    fans: dummyFans(u.nickname),
  };
}

export interface LeagueAccuracy {
  league: string;
  label: string;
  total: number;
  hit: number;
  rate: number;
  wilson: number; // 신뢰도 보정(정렬·시각 강조용)
}

/** 리그별 정확도 — 채점 완료된 예측만 match.league 로 묶음. wilson desc 정렬. */
export async function getUserLeagueAccuracy(userId: string): Promise<LeagueAccuracy[]> {
  const rows = await prisma.post.findMany({
    where: { authorId: userId, isCorrect: { not: null }, matchId: { not: null } },
    select: { isCorrect: true, match: { select: { league: true } } },
  });
  const map = new Map<string, { total: number; hit: number }>();
  for (const r of rows) {
    const lg = r.match?.league;
    if (!lg) continue;
    const e = map.get(lg) ?? { total: 0, hit: 0 };
    e.total++;
    if (r.isCorrect) e.hit++;
    map.set(lg, e);
  }
  return [...map.entries()]
    .map(([league, { total, hit }]) => ({
      league,
      label: leagueLabel(league),
      total,
      hit,
      rate: hitRate(hit, total),
      wilson: wilsonLower(hit, total),
    }))
    .sort((a, b) => b.wilson - a.wilson || b.total - a.total);
}

export interface PredictionItem {
  postId: number;
  title: string;
  createdAt: Date;
  views: number;
  league: string;
  label: string;
  home: string;
  away: string;
  market: string | null;
  pick: string | null;
  line: number | null;
  pickText: string;
  isCorrect: boolean | null;
  status: string | null;
  homeScore: number | null;
  awayScore: number | null;
  startTime: Date | null;
}

/** 예측 이력 — live(미채점, 경기 전/진행) / past(채점 완료). 최신순 + 페이지네이션. */
export async function getUserPredictions(
  userId: string,
  opts: { tab: "live" | "past"; page: number },
): Promise<{ items: PredictionItem[]; total: number; totalPages: number }> {
  const isPast = opts.tab === "past";
  const where: Prisma.PostWhereInput = {
    authorId: userId,
    matchId: { not: null },
    isCorrect: isPast ? { not: null } : null,
  };
  const page = Math.max(1, opts.page);
  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PROFILE_PAGE_SIZE,
      take: PROFILE_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        createdAt: true,
        views: true,
        market: true,
        pick: true,
        line: true,
        isCorrect: true,
        match: {
          select: {
            league: true,
            status: true,
            homeScore: true,
            awayScore: true,
            startTime: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const items: PredictionItem[] = posts
    .filter((p) => p.match)
    .map((p) => {
      const m = p.match!;
      const home = toKoreanTeamName(m.homeTeam.name, m.league);
      const away = toKoreanTeamName(m.awayTeam.name, m.league);
      return {
        postId: p.id,
        title: p.title,
        createdAt: p.createdAt,
        views: p.views,
        league: m.league,
        label: leagueLabel(m.league),
        home,
        away,
        market: p.market,
        pick: p.pick,
        line: p.line,
        pickText: pickLabel(p.market, p.pick, p.line, home, away),
        isCorrect: p.isCorrect,
        status: m.status,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        startTime: m.startTime,
      };
    });

  return { items, total, totalPages: Math.max(1, Math.ceil(total / PROFILE_PAGE_SIZE)) };
}
