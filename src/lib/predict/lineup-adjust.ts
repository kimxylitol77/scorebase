// 축구 확정 라인업(XI) 평점 보정 — MLB starter-adjust 패턴의 축구판.
//
// 컨셉: "이번 확정 XI 의 평소 평점 합" vs "그 팀 최근 경기 XI 평점 합 평균" 갭으로
// 로테이션·주전 결장을 감지한다. Elo 는 팀 단위라 이걸 원천적으로 못 본다.
//   - 주전 GK·에이스 결장 → 이번 XI 강도 ↓ → gap 음수 → winProb 감점
//   - 풀전력 복귀 → gap 양수
//
// 데이터: TheSportsMatchCache.lineup (선수별 rating, 경기 후 확정).
//   af 라인업은 평점이 없어 미적용 — TheSports lineup confirmed=1 매치 전용.
// 발동 시점: 라인업 확정(킥오프 ~1h 전) 후 predict 재계산 트리거에서.

import { prisma } from "@/lib/db";

export interface LineupAdjustment {
  /** 홈 winProb 에 더할 보정값. (homeGap - awayGap) × 계수, clamp ±0.12 */
  homeShift: number;
  /** 이번 XI 평점합 - 팀 기준선 (디버그·reason 표기용) */
  homeGap: number;
  awayGap: number;
  applied: boolean;
}

const EMPTY: LineupAdjustment = { homeShift: 0, homeGap: 0, awayGap: 0, applied: false };

// XI 평점합 1.0점 차이 ≈ 1.5%p — 보수적 시작값 (TheSports 평점 평균 ~6.9,
// 주전→벤치 교체 1명당 평점 차 ~0.3 → 5명 로테이션 ≈ 1.5점 ≈ 2.3%p).
const SHIFT_PER_RATING = 0.015;
const SHIFT_CLAMP = 0.12;
/** 기준선 신뢰 최소 표본 — 라인업 있는 최근 경기 수.
 *  TheSports lineup 조회가 30일 한도라 시즌 초반·신규 리그는 3경기가 현실 상한 —
 *  3경기면 발동하되 weight 0.7 (MLB starter-adjust 의 GS<5 → 0.5 패턴과 동일 원리). */
const MIN_HISTORY = 3;
const LOW_SAMPLE_WEIGHT = 0.7;
/** 평점 이력 없는 선수(신규·외곽 로테이션)의 가정 평점: 팀 XI 평균 - 0.25 */
const UNKNOWN_PENALTY = 0.25;

interface TsLineupPlayer {
  id?: string;
  first?: number;
  rating?: string;
}
interface TsLineup {
  confirmed?: number;
  lineup?: { home?: TsLineupPlayer[] | Record<string, TsLineupPlayer>; away?: TsLineupPlayer[] | Record<string, TsLineupPlayer> };
}

function startersOf(side: TsLineupPlayer[] | Record<string, TsLineupPlayer> | undefined): TsLineupPlayer[] {
  return Object.values(side ?? {}).filter((p) => p?.first === 1 && p.id);
}

/** 팀 최근 경기들의 lineup cache 에서 ① 선수별 평점 평균 ② 경기별 XI 평점합 평균(기준선). */
async function loadTeamXiHistory(
  teamId: number,
  before: Date,
): Promise<{ playerAvg: Map<string, number>; baseline: number; games: number } | null> {
  const rows = await prisma.theSportsMatchCache.findMany({
    where: {
      lineup: { not: undefined },
      match: {
        status: "FINISHED",
        startTime: { lt: before, gte: new Date(before.getTime() - 120 * 86400e3) },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
    },
    orderBy: { match: { startTime: "desc" } },
    take: 8,
    select: { lineup: true, match: { select: { homeTeamId: true } } },
  });
  const ratingsByPlayer = new Map<string, number[]>();
  const xiSums: number[] = [];
  for (const r of rows) {
    const lu = r.lineup as TsLineup | null;
    if (!lu || lu.confirmed !== 1 || !lu.lineup) continue;
    const side = r.match.homeTeamId === teamId ? lu.lineup.home : lu.lineup.away;
    const starters = startersOf(side);
    const rated = starters
      .map((p) => ({ id: p.id!, rating: parseFloat(p.rating ?? "0") || 0 }))
      .filter((p) => p.rating > 0);
    if (rated.length < 9) continue; // 평점 미부여 경기(몰수·데이터 결손) 제외
    let sum = 0;
    for (const p of rated) {
      sum += p.rating;
      const arr = ratingsByPlayer.get(p.id) ?? [];
      arr.push(p.rating);
      ratingsByPlayer.set(p.id, arr);
    }
    // 11명 기준으로 정규화 (rated 9~11명 변동 보정)
    xiSums.push((sum / rated.length) * 11);
  }
  if (xiSums.length < MIN_HISTORY) return null;
  const playerAvg = new Map<string, number>();
  for (const [id, arr] of ratingsByPlayer) {
    playerAvg.set(id, arr.reduce((a, b) => a + b, 0) / arr.length);
  }
  const baseline = xiSums.reduce((a, b) => a + b, 0) / xiSums.length;
  return { playerAvg, baseline, games: xiSums.length };
}

/** 이번 확정 XI 의 "평소 평점 합" — 이력 없는 선수는 (XI 평균 - 0.25) 가정. */
function xiStrength(xiIds: string[], hist: { playerAvg: Map<string, number>; baseline: number }): number {
  const avgPerPlayer = hist.baseline / 11;
  let sum = 0;
  for (const id of xiIds) {
    sum += hist.playerAvg.get(id) ?? avgPerPlayer - UNKNOWN_PENALTY;
  }
  return sum;
}

/**
 * 매치의 확정 라인업 + 양팀 이력으로 보정값 산출.
 * 라인업 미확정 / 이력 부족(< 4경기) 이면 applied=false.
 */
export async function computeLineupAdjustment(
  matchId: number,
  homeTeamId: number,
  awayTeamId: number,
  startTime: Date,
): Promise<LineupAdjustment> {
  const cache = await prisma.theSportsMatchCache.findUnique({
    where: { matchId },
    select: { lineup: true },
  });
  const lu = cache?.lineup as TsLineup | null;
  if (!lu || lu.confirmed !== 1 || !lu.lineup) return EMPTY;
  const homeXi = startersOf(lu.lineup.home).map((p) => p.id!);
  const awayXi = startersOf(lu.lineup.away).map((p) => p.id!);
  if (homeXi.length < 10 || awayXi.length < 10) return EMPTY;

  const [homeHist, awayHist] = await Promise.all([
    loadTeamXiHistory(homeTeamId, startTime),
    loadTeamXiHistory(awayTeamId, startTime),
  ]);
  if (!homeHist || !awayHist) return EMPTY;

  const homeGap = xiStrength(homeXi, homeHist) - homeHist.baseline;
  const awayGap = xiStrength(awayXi, awayHist) - awayHist.baseline;
  // 표본 부족(어느 한쪽 3경기) 시 보정 강도 디스카운트
  const weight =
    Math.min(homeHist.games, awayHist.games) < 4 ? LOW_SAMPLE_WEIGHT : 1.0;
  const homeShift =
    Math.max(
      -SHIFT_CLAMP,
      Math.min(SHIFT_CLAMP, (homeGap - awayGap) * SHIFT_PER_RATING),
    ) * weight;
  return { homeShift, homeGap, awayGap, applied: true };
}

/** WinProb 에 보정 적용 — starter-adjust 와 동일 방식 (draw 유지, home↔away 이동 후 정규화). */
export function applyLineupToWinProb(
  base: { home: number; draw: number; away: number },
  adj: LineupAdjustment,
): { home: number; draw: number; away: number } {
  if (!adj.applied || adj.homeShift === 0) return base;
  const home = Math.max(0.02, Math.min(0.96, base.home + adj.homeShift));
  const away = Math.max(0.02, Math.min(0.96, base.away - adj.homeShift));
  const sum = home + away + base.draw;
  return { home: home / sum, draw: base.draw / sum, away: away / sum };
}
