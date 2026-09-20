// 선수 종합·유망주·상승률 랭킹 — /transfers 랭킹 뷰의 집계(시즌 기록, 6h 캐시)와 순수 계산 함수.
// 후보 풀은 몸값 표와 같은 enriched 집합을 호출부가 넘긴다(표기 일치). 계산 근거는 docs/transfers-rankings.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/** 이번 시즌 선수별 누적 — PlayerMatchLog(ts id) group by. rating 은 분 가중 평균. */
export interface SeasonPlayerStat {
  n: number; // 출전 경기
  starts: number;
  mins: number;
  g: number;
  a: number;
  ratedN: number; // 평점 있는 경기 수
  rating: number | null; // 분 가중 평균 평점
}

/** 유럽 시즌 시작(7/1). 7월 이후면 올해, 아니면 작년. */
export function seasonStartUtc(now = new Date()): Date {
  const y = now.getUTCFullYear();
  return new Date(Date.UTC(now.getUTCMonth() >= 6 ? y : y - 1, 6, 1));
}

interface RawAgg {
  playerId: string; n: number; starts: number; mins: number; g: number; a: number; ratedN: number; ratingW: number | null;
}

export const getSeasonPlayerStats = unstable_cache(
  async (): Promise<Record<string, SeasonPlayerStat>> => {
    const rows = await prisma.$queryRaw<RawAgg[]>`
      SELECT "playerId",
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE started)::int AS starts,
        COALESCE(SUM(minutes), 0)::int AS mins,
        COALESCE(SUM(goals), 0)::int AS g,
        COALESCE(SUM(assists), 0)::int AS a,
        COUNT(rating)::int AS "ratedN",
        CASE WHEN COALESCE(SUM(minutes) FILTER (WHERE rating IS NOT NULL), 0) > 0
          THEN SUM(rating * minutes) FILTER (WHERE rating IS NOT NULL) / SUM(minutes) FILTER (WHERE rating IS NOT NULL)
          ELSE AVG(rating) END AS "ratingW"
      FROM "PlayerMatchLog"
      WHERE date >= ${seasonStartUtc()}
      GROUP BY "playerId"`;
    const out: Record<string, SeasonPlayerStat> = {};
    for (const r of rows) {
      out[r.playerId] = {
        n: r.n, starts: r.starts, mins: r.mins, g: r.g, a: r.a, ratedN: r.ratedN,
        rating: r.ratingW == null ? null : Math.round(Number(r.ratingW) * 100) / 100,
      };
    }
    return out;
  },
  ["transfers-season-player-stats-v1"],
  { revalidate: 6 * 3600, tags: ["transfers-season-player-stats"] },
);

// ── 순수 계산 ─────────────────────────────────────────────────────────────

export type PosGroup = "ATT" | "MID" | "DEF" | "GK";
export function posGroupOf(posCode: string | null | undefined): PosGroup {
  switch (posCode) {
    case "GK": return "GK";
    case "CB": case "FB": case "DF": return "DEF";
    case "DM": case "CM": case "MF": return "MID";
    default: return "ATT"; // ST·W·AM·FW·미상
  }
}

/** 종합 지수 가중치(합 100) — 포지션 그룹별. 수비·GK 는 골 기여 대신 평점·출전 비중. */
export const POWER_WEIGHTS: Record<PosGroup, { rating: number; ga90: number; mins: number; value: number; trend: number }> = {
  ATT: { rating: 35, ga90: 30, mins: 15, value: 12, trend: 8 },
  MID: { rating: 40, ga90: 20, mins: 18, value: 14, trend: 8 },
  DEF: { rating: 45, ga90: 10, mins: 20, value: 17, trend: 8 },
  GK: { rating: 45, ga90: 0, mins: 25, value: 20, trend: 10 },
};
export const POWER_MIN_MINUTES = 180;
export const POWER_MIN_RATED = 3;
export const PROSPECT_MIN_MINUTES = 90;
export const PROSPECT_MAX_AGE = 21;
export const GROWTH_MIN_BASE = 1; // €M, 1년 전
export const GROWTH_MIN_CURRENT = 2; // €M

export interface RankInput {
  id: string;
  value: number; // €M 현재
  v1y: number | null; // €M 1년 전
  age: number | null;
  posCode: string | null;
  stat: SeasonPlayerStat | null;
}

export interface PowerBreakdown { rating: number; ga90: number; mins: number; value: number; trend: number }
export interface PowerRow { id: string; score: number; parts: PowerBreakdown; ga90: number; trendPct: number | null }

/** 0~100 백분위(동점은 평균 순위). values 가 비면 빈 Map. */
export function percentiles(entries: Array<[string, number]>): Map<string, number> {
  const out = new Map<string, number>();
  if (entries.length === 0) return out;
  if (entries.length === 1) { out.set(entries[0][0], 100); return out; }
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][1] === sorted[i][1]) j++;
    const rank = (i + j) / 2; // 0-based 평균 순위
    const pct = (rank / (sorted.length - 1)) * 100;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], pct);
    i = j + 1;
  }
  return out;
}

export function trendPctOf(value: number, v1y: number | null): number | null {
  if (v1y == null || v1y <= 0) return null;
  return Math.max(-80, Math.min(300, ((value - v1y) / v1y) * 100));
}

/** 종합 지수 — 자격(180분·평점 3경기) 충족 선수만 순위. 반환은 점수 내림차순. */
export function computePowerRanking(pool: RankInput[]): PowerRow[] {
  const elig = pool.filter((p) => p.stat && p.stat.mins >= POWER_MIN_MINUTES && p.stat.ratedN >= POWER_MIN_RATED && p.stat.rating != null);
  if (elig.length === 0) return [];
  const groupOf = (p: RankInput) => posGroupOf(p.posCode);
  const ga90Of = (p: RankInput) => ((p.stat!.g + p.stat!.a) / p.stat!.mins) * 90;
  // 포지션 그룹 내 백분위(평점·GA90), 전체 풀 백분위(출전·몸값·추세)
  const ratingPct = new Map<string, number>();
  const ga90Pct = new Map<string, number>();
  for (const grp of ["ATT", "MID", "DEF", "GK"] as PosGroup[]) {
    const g = elig.filter((p) => groupOf(p) === grp);
    for (const [id, v] of percentiles(g.map((p) => [p.id, p.stat!.rating!]))) ratingPct.set(id, v);
    for (const [id, v] of percentiles(g.map((p) => [p.id, ga90Of(p)]))) ga90Pct.set(id, v);
  }
  const minsPct = percentiles(elig.map((p) => [p.id, p.stat!.mins]));
  const valuePct = percentiles(elig.map((p) => [p.id, Math.log(Math.max(0.1, p.value))]));
  const trendEntries = elig.map((p) => [p.id, trendPctOf(p.value, p.v1y)] as const).filter((e): e is readonly [string, number] => e[1] != null);
  const trendPct = percentiles(trendEntries.map(([id, v]) => [id, v]));
  return elig
    .map((p) => {
      const w = POWER_WEIGHTS[groupOf(p)];
      const parts: PowerBreakdown = {
        rating: ratingPct.get(p.id) ?? 0,
        ga90: ga90Pct.get(p.id) ?? 0,
        mins: minsPct.get(p.id) ?? 0,
        value: valuePct.get(p.id) ?? 0,
        trend: trendPct.get(p.id) ?? 50, // 이력 없으면 중립
      };
      const score = (parts.rating * w.rating + parts.ga90 * w.ga90 + parts.mins * w.mins + parts.value * w.value + parts.trend * w.trend) / 100;
      return { id: p.id, score: Math.round(score * 10) / 10, parts, ga90: Math.round(ga90Of(p) * 100) / 100, trendPct: trendPctOf(p.value, p.v1y) };
    })
    .sort((a, b) => b.score - a.score || b.parts.rating - a.parts.rating);
}

export interface ProspectRow { id: string; score: number; parts: { value: number; rating: number; mins: number }; ageBonus: number }

/** 유망주 지수 — maxAge 이하·90분 이상. 풀 안에서 백분위, 나이 보정 후 100 상한. */
export function computeProspectRanking(pool: RankInput[], maxAge = PROSPECT_MAX_AGE): ProspectRow[] {
  const elig = pool.filter((p) => p.age != null && p.age <= maxAge && p.stat && p.stat.mins >= PROSPECT_MIN_MINUTES);
  if (elig.length === 0) return [];
  const valuePct = percentiles(elig.map((p) => [p.id, Math.log(Math.max(0.1, p.value))]));
  const minsPct = percentiles(elig.map((p) => [p.id, p.stat!.mins]));
  const ratingPct = new Map<string, number>();
  for (const grp of ["ATT", "MID", "DEF", "GK"] as PosGroup[]) {
    const g = elig.filter((p) => posGroupOf(p.posCode) === grp && p.stat!.ratedN >= 2 && p.stat!.rating != null);
    for (const [id, v] of percentiles(g.map((p) => [p.id, p.stat!.rating!]))) ratingPct.set(id, v);
  }
  return elig
    .map((p) => {
      const parts = { value: valuePct.get(p.id) ?? 0, rating: ratingPct.get(p.id) ?? 40, mins: minsPct.get(p.id) ?? 0 };
      const base = parts.value * 0.5 + parts.rating * 0.3 + parts.mins * 0.2;
      const ageBonus = 1 + 0.04 * Math.max(0, maxAge - (p.age ?? maxAge));
      return { id: p.id, score: Math.round(Math.min(100, base * ageBonus) * 10) / 10, parts, ageBonus };
    })
    .sort((a, b) => b.score - a.score || b.parts.value - a.parts.value);
}

export type GrowthMode = "pct" | "abs" | "down";
export interface GrowthRow { id: string; v1y: number; pct: number; abs: number }

/** 1년 몸값 변동 — 노이즈 컷(1년 전 1M·현재 2M). mode 별 정렬. */
export function computeGrowthRanking(pool: RankInput[], mode: GrowthMode = "pct"): GrowthRow[] {
  const rows = pool
    .filter((p) => p.v1y != null && p.v1y >= GROWTH_MIN_BASE && p.value >= GROWTH_MIN_CURRENT)
    .map((p) => ({ id: p.id, v1y: p.v1y!, pct: Math.round(((p.value - p.v1y!) / p.v1y!) * 100), abs: Math.round((p.value - p.v1y!) * 10) / 10 }));
  if (mode === "down") return rows.filter((r) => r.abs < 0).sort((a, b) => a.pct - b.pct || a.abs - b.abs);
  const up = rows.filter((r) => r.abs > 0);
  return mode === "abs" ? up.sort((a, b) => b.abs - a.abs || b.pct - a.pct) : up.sort((a, b) => b.pct - a.pct || b.abs - a.abs);
}
