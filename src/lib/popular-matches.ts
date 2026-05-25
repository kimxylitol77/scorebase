// 인기 매치 위젯 데이터 helper — PageView 의 /live/{league}/{gameId} path 를
// 최근 24h 안에서 unique session 기준 카운트, top N 추출 후 Match 정보 join.

import { prisma } from "@/lib/db";

export interface PopularMatch {
  league: string;
  externalId: string;
  matchId: number | null;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  startTime: Date | null;
  views: number; // unique session count
}

const PATH_RE = /^\/live\/([A-Z0-9_]+)\/([^/?#]+)/;

/**
 * 최근 24h 인기 라이브 매치 top N.
 * PageView path 가 '/live/{league}/{gameId}' 패턴 → 정규식 추출 →
 * (league, gameId) 별 unique sessionId 카운트 → Match 메타 join.
 */
export async function getPopularLiveMatches(limit = 5): Promise<PopularMatch[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  // raw SQL — Prisma 의 groupBy 로는 정규식 + distinct count 한 번에 안 됨.
  // 그리고 prisma client 의 $queryRaw 가 빠름.
  const rows = await prisma.$queryRaw<Array<{ path: string; views: bigint }>>`
    SELECT "path", COUNT(DISTINCT COALESCE("sessionId", "userAgent", CAST(id AS text))) AS views
    FROM "PageView"
    WHERE "ts" >= ${since}
      AND "path" ~ '^/live/[A-Z0-9_]+/[^/?#]+'
    GROUP BY "path"
    ORDER BY views DESC
    LIMIT ${limit * 3}
  `;

  // path → (league, externalId) 추출 + dedup (path 가 query string 미세 차이로 분리될 수 있음)
  const aggByKey = new Map<string, { league: string; externalId: string; views: number }>();
  for (const r of rows) {
    const m = r.path.match(PATH_RE);
    if (!m) continue;
    const key = `${m[1]}|${m[2]}`;
    const prev = aggByKey.get(key)?.views ?? 0;
    aggByKey.set(key, { league: m[1], externalId: m[2], views: prev + Number(r.views) });
  }
  const top = Array.from(aggByKey.values())
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
  if (top.length === 0) return [];

  // Match 메타 fetch — (league, externalId) 쌍이 PK 가 아니라서 OR 묶음
  const matches = await prisma.match.findMany({
    where: {
      OR: top.map((t) => ({ league: t.league, externalId: t.externalId })),
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      status: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const byKey = new Map(matches.map((m) => [`${m.league}|${m.externalId}`, m]));

  return top.map((t) => {
    const m = byKey.get(`${t.league}|${t.externalId}`);
    return {
      league: t.league,
      externalId: t.externalId,
      matchId: m?.id ?? null,
      homeName: m?.homeTeam.name ?? null,
      awayName: m?.awayTeam.name ?? null,
      homeScore: m?.homeScore ?? null,
      awayScore: m?.awayScore ?? null,
      status: m?.status ?? null,
      startTime: m?.startTime ?? null,
      views: t.views,
    };
  });
}
