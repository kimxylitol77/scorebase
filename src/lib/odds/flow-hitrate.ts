// 배당 하락(돈 몰림) 경기의 실제 적중률 집계 — 배당 흐름 페이지의 "흐름 통계" 데이터.
// "우리 예측이 맞다"가 아니라 "배당이 이렇게 움직인 경기의 실제 승률은 이렇다"는 중립 팩트.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

export type FlowHitrate = {
  total: number; // 하락 신호가 있던 종료 경기 수 (무승부 제외)
  hit: number;
  hitPct: number | null;
  windowDays: number;
  buckets: { label: string; total: number; hitPct: number | null }[];
};

const DROP_THRESHOLD = 1.5; // 이 % 이상 하락해야 "돈 몰림" 신호로 집계

async function compute(leagues: string[], windowDays: number): Promise<FlowHitrate> {
  const since = new Date(Date.now() - windowDays * 24 * 3600 * 1000);
  const rows = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
      startTime: { gte: since },
    },
    select: { id: true, startTime: true, homeScore: true, awayScore: true },
    take: 5000,
  });
  const ids = rows.map((r) => r.id);
  const snaps = ids.length
    ? await prisma.oddsSnapshot.findMany({
        where: { matchId: { in: ids } },
        orderBy: { fetchedAt: "asc" },
        select: { matchId: true, fetchedAt: true, homeOdds: true, awayOdds: true },
      })
    : [];
  const byMatch = new Map<number, { t: number; h: number; a: number }[]>();
  for (const s of snaps) {
    const arr = byMatch.get(s.matchId) ?? [];
    arr.push({ t: s.fetchedAt.getTime(), h: s.homeOdds, a: s.awayOdds });
    byMatch.set(s.matchId, arr);
  }

  const bucketDefs = [
    { label: "1.5~3%", min: 1.5, max: 3 },
    { label: "3~6%", min: 3, max: 6 },
    { label: "6%+", min: 6, max: Infinity },
  ];
  const bstat = bucketDefs.map((b) => ({ ...b, total: 0, hit: 0 }));
  let total = 0;
  let hit = 0;

  for (const m of rows) {
    const kickoff = m.startTime.getTime();
    const pts = (byMatch.get(m.id) ?? []).filter((p) => p.t <= kickoff);
    if (pts.length < 2) continue;
    const deltas = (["h", "a"] as const).map((k) => {
      const vals = pts.map((p) => p[k]).filter((v): v is number => v != null && v > 0);
      if (vals.length < 2) return { key: k, deltaPct: 0 };
      const open = vals[0];
      const cur = vals[vals.length - 1];
      return { key: k, deltaPct: ((cur - open) / open) * 100 };
    });
    const mv = deltas.sort((a, b) => a.deltaPct - b.deltaPct)[0];
    if (!mv || mv.deltaPct >= -DROP_THRESHOLD) continue; // 유의미한 하락 없음
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    if (hs === as) continue; // 무승부 제외 (2-way 승률)
    const actual = hs > as ? "h" : "a";
    const isHit = mv.key === actual;
    total++;
    if (isHit) hit++;
    const ad = Math.abs(mv.deltaPct);
    const bk = bstat.find((b) => ad >= b.min && ad < b.max);
    if (bk) {
      bk.total++;
      if (isHit) bk.hit++;
    }
  }

  return {
    total,
    hit,
    hitPct: total ? (hit / total) * 100 : null,
    windowDays,
    buckets: bstat.map((b) => ({
      label: b.label,
      total: b.total,
      hitPct: b.total ? (b.hit / b.total) * 100 : null,
    })),
  };
}

// 무거운 집계(수백 경기 × 스냅샷)라 1시간 캐시. 종료 경기 통계는 자주 변하지 않는다.
export function getFlowHitrate(leagues: string[], windowDays = 60): Promise<FlowHitrate> {
  return unstable_cache(
    () => compute(leagues, windowDays),
    ["flow-hitrate", leagues.slice().sort().join(","), String(windowDays)],
    { revalidate: 3600 },
  )();
}
