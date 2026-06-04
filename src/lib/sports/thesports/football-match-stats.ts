// 축구 경기 부가 스탯(코너·카드·슈팅·점유율) 캡처.
// TheSports detailLive.stats = [{ type, home, away }] 에서 추출 → MatchStats 테이블 적재.
// 코너/카드 예측 모델(Dixon-Coles 보완) 학습 데이터셋을 종료 경기부터 누적한다.
//
// TheSports type 코드 (SoccerLiveStatsCard 매핑과 동일 단일 진실):
//   2=슛 총, 21=유효슛, 4=코너킥, 8=옐로카드, 9=레드카드, 25=점유율(%).

import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

const TYPE = {
  shots: 2,
  shotsOnTarget: 21,
  corners: 4,
  yellow: 8,
  red: 9,
  possession: 25,
} as const;

export interface FootballStats {
  homeCorners: number;
  awayCorners: number;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homePossession: number | null;
  awayPossession: number | null;
}

/** detailLive.stats → FootballStats. 코너(type 4)가 없으면 의미 없는 데이터로 보고 null. */
export function extractFootballStats(detailLive: unknown): FootballStats | null {
  const stats = (detailLive as { stats?: Array<{ type?: number; home?: number; away?: number }> } | null)
    ?.stats;
  if (!Array.isArray(stats) || stats.length === 0) return null;

  const by = new Map<number, { home?: number; away?: number }>();
  for (const s of stats) if (typeof s?.type === "number") by.set(s.type, s);

  const c = by.get(TYPE.corners);
  if (!c || typeof c.home !== "number" || typeof c.away !== "number") return null;

  const num = (t: number, k: "home" | "away"): number | null => {
    const v = by.get(t)?.[k];
    return typeof v === "number" ? v : null;
  };

  return {
    homeCorners: c.home,
    awayCorners: c.away,
    homeYellow: num(TYPE.yellow, "home"),
    awayYellow: num(TYPE.yellow, "away"),
    homeRed: num(TYPE.red, "home"),
    awayRed: num(TYPE.red, "away"),
    homeShots: num(TYPE.shots, "home"),
    awayShots: num(TYPE.shots, "away"),
    homeShotsOnTarget: num(TYPE.shotsOnTarget, "home"),
    awayShotsOnTarget: num(TYPE.shotsOnTarget, "away"),
    homePossession: num(TYPE.possession, "home"),
    awayPossession: num(TYPE.possession, "away"),
  };
}

/**
 * 종료된 축구 경기 중 아직 MatchStats 없는 것을 cache 에서 캡처 → 적재.
 * cache 는 삭제되지 않으므로(만료 race 없음) 천천히 누적해도 안전. idempotent.
 */
export async function captureFootballMatchStats(
  limit = 800,
): Promise<{ scanned: number; captured: number; skipped: number }> {
  const leagues = [...SOCCER_LEAGUES];
  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      status: "FINISHED",
      matchStats: { is: null },
      theSportsCache: { isNot: null },
    },
    select: {
      id: true,
      league: true,
      theSportsCache: { select: { detailLive: true } },
    },
    take: limit,
    orderBy: { startTime: "desc" },
  });

  let captured = 0;
  let skipped = 0;
  for (const m of matches) {
    const fs = extractFootballStats(m.theSportsCache?.detailLive);
    if (!fs) {
      skipped++;
      continue;
    }
    try {
      await prisma.matchStats.create({
        data: { matchId: m.id, league: m.league, ...fs },
      });
      captured++;
    } catch {
      // unique 충돌(동시 실행) 등 — 무시
      skipped++;
    }
  }
  return { scanned: matches.length, captured, skipped };
}
