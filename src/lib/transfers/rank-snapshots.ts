// /transfers 랭킹 순위 스냅샷 — 하루 1회(KST) 목록별 순위를 저장하고, 직전 스냅샷 대비 순위 변동을 계산한다.
// 저장은 페이지 렌더가 after() 로 흘리고(목록·날짜·선수 unique 라 중복 무해), 일일 cron 이 목록 URL 을 두드려 빠짐없이 남긴다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export const SNAPSHOT_KEEP_DAYS = 14;

/** KST 기준 오늘 00:00 을 UTC Date 로(@db.Date 컬럼용). */
export function kstToday(now = new Date()): Date {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}

export interface SnapshotRow { playerId: string; rank: number; league: string | null; posCode: string | null; score: number | null }

/** 오늘자 스냅샷 저장 — 이미 있으면 unique 로 조용히 건너뛴다. */
export async function writeRankSnapshot(list: string, rows: SnapshotRow[], day = kstToday()): Promise<number> {
  if (rows.length === 0) return 0;
  const exists = await prisma.playerRankSnapshot.findFirst({ where: { list, day }, select: { id: true } });
  if (exists) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await prisma.playerRankSnapshot.createMany({
      data: rows.slice(i, i + 1000).map((x) => ({ list, day, ...x })),
      skipDuplicates: true,
    });
    n += r.count;
  }
  return n;
}

export interface Baseline { day: string; rows: SnapshotRow[] }

/** 오늘 이전 가장 최근 스냅샷 — 목록·오늘 날짜로 1h 캐시(하루 안에 바뀌지 않는다). */
export const getRankBaseline = unstable_cache(
  async (list: string, todayIso: string): Promise<Baseline | null> => {
    const today = new Date(todayIso);
    const last = await prisma.playerRankSnapshot.findFirst({
      where: { list, day: { lt: today } },
      orderBy: { day: "desc" },
      select: { day: true },
    });
    if (!last) return null;
    const rows = await prisma.playerRankSnapshot.findMany({
      where: { list, day: last.day },
      orderBy: { rank: "asc" },
      select: { playerId: true, rank: true, league: true, posCode: true, score: true },
    });
    return { day: last.day.toISOString().slice(0, 10), rows };
  },
  ["transfers-rank-baseline-v1"],
  { revalidate: 3600, tags: ["transfers-rank-baseline"] },
);

/**
 * 기준선 순위 맵 — 리그·포지션 필터가 걸린 화면이면 기준선도 같은 필터로 좁혀 다시 번호를 매긴다
 * (전체 순위끼리 비교하면 필터 화면의 1위가 "▼37" 로 보인다).
 */
export function baselineRankMap(base: Baseline | null, filter: { league?: string; pos?: string }): Map<string, number> | null {
  if (!base) return null;
  const rows = base.rows.filter((r) => (!filter.league || r.league === filter.league) && (!filter.pos || r.posCode === filter.pos));
  return new Map(rows.map((r, i) => [r.playerId, i + 1]));
}

/** 표시용 변동 — 기준선 없음 undefined, 기준선에 없던 선수 null(NEW), 그 외 이전 순위. */
export function prevRankOf(map: Map<string, number> | null, playerId: string): number | null | undefined {
  if (!map) return undefined;
  return map.get(playerId) ?? null;
}

/** 오래된 스냅샷 정리(cron). */
export async function pruneRankSnapshots(now = new Date()): Promise<number> {
  const cut = new Date(kstToday(now).getTime() - SNAPSHOT_KEEP_DAYS * 86400_000);
  const r = await prisma.playerRankSnapshot.deleteMany({ where: { day: { lt: cut } } });
  return r.count;
}
