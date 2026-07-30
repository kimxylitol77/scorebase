// 오프닝 배당이 비슷했던 과거 경기의 실제 결과 분포 — 야구 3리그(MLB·NPB·KBO) 전용.
//
// Match.openingMarketHome 은 vig 제거된 홈 implied 확률(0~1). 대상 경기와 오프닝
// 홈확률이 가까운 종료 경기를 모아 "시장이 그 정도로 봤을 때 실제로는 어떻게
// 끝났나" 를 보여준다. 결정 근거·실측은 docs/opening-odds-similar/context-notes.md.
//
// 축구는 제외 — openingMarketHome 채움률이 0 이다 (2026-07-30 실측).

import { prisma } from "@/lib/db";

/** 오프닝 배당 유사경기 카드를 지원하는 리그 — 배당 데이터가 실제로 있는 야구 3리그. */
export const OPENING_SIMILAR_LEAGUES = new Set(["MLB", "NPB", "KBO"]);

/**
 * 야구 프리매치 오프닝 홈 implied 의 현실 범위.
 * 이 밖의 값은 in-play 배당 누수·오매핑으로 굳은 오염 (메모리 odds-inplay-mismatch).
 * MLB 실측 범위가 0.046~0.978 로 벌어져 있어 표시 계층에서 배제한다.
 */
const VALID_MIN = 0.25;
const VALID_MAX = 0.8;

/** 유사 판정 밴드 — 기본 ±0.03, 표본 부족 시 한 번만 ±0.05 로 넓힌다. */
const BAND_NARROW = 0.03;
const BAND_WIDE = 0.05;

/** 이 미만이면 비율을 말할 근거가 부족하다고 보고 카드를 숨긴다. */
const MIN_SAMPLE = 20;

export interface OpeningSimilarStats {
  /** 대상 경기의 오프닝 홈 implied 확률 */
  targetImplied: number;
  /** 실제 사용된 밴드 (±) */
  band: number;
  sampleSize: number;
  homeWins: number;
  awayWins: number;
  /** KBO·NPB 는 연장 후 무승부가 있다 (MLB 는 0건) */
  draws: number;
  /** 표본의 실제 홈승률 — 무승부를 분모에 포함 */
  actualHomeWinRate: number;
  /** 표본의 평균 오프닝 홈 implied — 시장이 본 값 */
  marketAvgImplied: number;
  /** 실제 - 시장 (%p). 양수면 시장이 홈을 과소평가했다는 뜻 */
  gapPoints: number;
}

/**
 * 대상 경기와 오프닝 배당이 비슷했던 같은 리그 종료 경기의 결과 분포.
 * 지원 리그가 아니거나 오프닝값이 없거나 오염 범위이거나 표본 미달이면 null.
 */
export async function getOpeningSimilarStats(match: {
  id: number;
  league: string;
  openingMarketHome: number | null;
}): Promise<OpeningSimilarStats | null> {
  if (!OPENING_SIMILAR_LEAGUES.has(match.league)) return null;

  const target = match.openingMarketHome;
  if (target == null) return null;
  // 대상 경기 자체가 오염 범위면 유사 판정의 기준점이 될 수 없다.
  if (target < VALID_MIN || target > VALID_MAX) return null;

  for (const band of [BAND_NARROW, BAND_WIDE]) {
    const rows = await prisma.match.findMany({
      where: {
        league: match.league,
        status: "FINISHED",
        id: { not: match.id },
        homeScore: { not: null },
        awayScore: { not: null },
        openingMarketHome: {
          // 밴드와 오염 배제를 동시에 — 넓힌 밴드가 현실 범위를 넘지 않게 한다.
          gte: Math.max(target - band, VALID_MIN),
          lte: Math.min(target + band, VALID_MAX),
        },
      },
      select: { homeScore: true, awayScore: true, openingMarketHome: true },
    });

    if (rows.length < MIN_SAMPLE) continue;

    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;
    let impliedSum = 0;
    for (const r of rows) {
      const h = r.homeScore as number;
      const a = r.awayScore as number;
      if (h > a) homeWins++;
      else if (h < a) awayWins++;
      else draws++;
      impliedSum += r.openingMarketHome as number;
    }

    const actualHomeWinRate = homeWins / rows.length;
    const marketAvgImplied = impliedSum / rows.length;
    return {
      targetImplied: target,
      band,
      sampleSize: rows.length,
      homeWins,
      awayWins,
      draws,
      actualHomeWinRate,
      marketAvgImplied,
      gapPoints: (actualHomeWinRate - marketAvgImplied) * 100,
    };
  }

  return null;
}
