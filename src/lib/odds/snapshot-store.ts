// 라이브 odds snapshot 저장 + 조회 helper.
// /api/live/* route 가 fetchLiveOdds 후 saveOddsSnapshot 호출 — 1분 dedup (같은 매치 + 같은 분 skip).
// 페이지 SSR 이 getOddsHistory 로 최근 30 row 조회 → sparkline 차트.

import { prisma } from "@/lib/db";
import type { LiveOddsSnapshot } from "./live-odds";

export interface OddsHistoryPoint {
  fetchedAt: number; // epoch ms
  home: number;
  draw: number | null;
  away: number;
}

/** snapshot 저장 — externalId 로 우리 Match.id 찾고 dedup (1분 unique). */
export async function saveOddsSnapshot(
  externalId: string,
  league: string,
  odds: LiveOddsSnapshot | null,
): Promise<void> {
  if (!odds?.h2h) return;
  try {
    const match = await prisma.match.findFirst({
      where: { externalId, league },
      select: { id: true },
    });
    if (!match) return;
    // 같은 매치 + 같은 분 중복 회피 (cron + 사용자 polling 양쪽 호출 흡수)
    const oneMinAgo = new Date(Date.now() - 60_000);
    const recent = await prisma.oddsSnapshot.findFirst({
      where: { matchId: match.id, fetchedAt: { gte: oneMinAgo } },
      select: { id: true },
    });
    if (recent) return;
    await prisma.oddsSnapshot.create({
      data: {
        matchId: match.id,
        homeOdds: odds.h2h.home,
        drawOdds: odds.h2h.draw,
        awayOdds: odds.h2h.away,
        bookmakers: odds.bookmakers,
      },
    });
  } catch {
    // best-effort — 실패해도 응답에 영향 없음
  }
}

/** 매치 디테일 배당 변동 차트용 — 최근 snapshot (오래된→최신 순). 최대 72시간 window(오프닝~킥오프 흐름).
 * 킥오프 이후 스냅샷은 제외 — in-play 정지/종료 배당(한쪽 무한대 근접)이 y축을 지배해 pre-match 흐름을 뭉개는 것 방지. */
export async function getOddsHistory(matchId: number, limit = 150): Promise<OddsHistoryPoint[]> {
  const since = new Date(Date.now() - 72 * 3600 * 1000);
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { startTime: true },
  });
  const before = match?.startTime ?? new Date();
  const rows = await prisma.oddsSnapshot.findMany({
    where: { matchId, fetchedAt: { gte: since, lte: before } },
    orderBy: { fetchedAt: "desc" },
    take: limit,
    select: { fetchedAt: true, homeOdds: true, drawOdds: true, awayOdds: true },
  });
  return rows
    .reverse()
    .map((r) => ({
      fetchedAt: r.fetchedAt.getTime(),
      home: r.homeOdds,
      draw: r.drawOdds,
      away: r.awayOdds,
    }));
}
