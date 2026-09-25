// 팀 매핑이 없어 버려진 TheSports 경기 기록 — 리그별 최신 스냅샷(HealthCheck category="ts-unmapped")
//
// 왜 필요한가. 하키·농구·야구·배구 워커는 매핑 없는 팀의 경기를 사이트로 보내기 전에 거르고, 축구는
// 수신 라우트가 skippedNoTeam 으로 버린다. 둘 다 조용해서 하키 친선 144경기가 한 달 동안 빠진 채
// 아무도 몰랐다(2026-09-25). 버리는 그 자리에서 목록을 남기면 schedule-watch 가 "아직도 DB 에 없는
// 경기"만 골라 알릴 수 있다 — TheSports 를 다시 조회할 필요가 없다.

import { prisma } from "@/lib/db";

export interface UnmappedMatch {
  league: string;
  tsMatchId: string;
  startTime: string;
  tsHomeTeamId: string;
  tsAwayTeamId: string;
}

const CATEGORY = "ts-unmapped";
const KEEP_PAST_MS = 3 * 86400_000; // 지난 경기는 3일까지만 — 그보다 오래된 건 복구 가치가 낮다
const MAX_PER_LEAGUE = 200;

/** 리그별로 기존 스냅샷과 합쳐(경기 id 기준 중복 제거) 갱신한다. 실패해도 수집을 막지 않게 호출부에서 catch. */
export async function recordUnmapped(sport: string, list: UnmappedMatch[]): Promise<void> {
  if (!list.length) return;
  const byLeague = new Map<string, UnmappedMatch[]>();
  for (const m of list) byLeague.set(m.league, [...(byLeague.get(m.league) ?? []), m]);
  const cutoff = Date.now() - KEEP_PAST_MS;
  for (const [league, items] of byLeague) {
    const prev = await prisma.healthCheck.findFirst({
      where: { category: CATEGORY, key: league },
      orderBy: { runAt: "desc" },
      select: { id: true, metadata: true },
    });
    const merged = new Map<string, UnmappedMatch>();
    for (const m of [...(((prev?.metadata as { matches?: UnmappedMatch[] } | null)?.matches) ?? []), ...items]) {
      if (Date.parse(m.startTime) >= cutoff) merged.set(m.tsMatchId, m);
    }
    const matches = [...merged.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(-MAX_PER_LEAGUE);
    const data = {
      severity: "LOW",
      message: `${sport} ${league} 팀 매핑 없어 버린 경기 ${matches.length}건`,
      metadata: { sport, matches } as object,
      runAt: new Date(),
    };
    if (prev) await prisma.healthCheck.update({ where: { id: prev.id }, data });
    else await prisma.healthCheck.create({ data: { category: CATEGORY, key: league, ...data } });
  }
}

/** schedule-watch 용 — 최근 26시간 안에 갱신된 스냅샷(워커가 살아서 보고 중인 리그)만 읽는다. */
export async function loadUnmapped(now: Date): Promise<Array<{ league: string; sport: string; matches: UnmappedMatch[] }>> {
  const rows = await prisma.healthCheck.findMany({
    where: { category: CATEGORY, runAt: { gte: new Date(now.getTime() - 26 * 3600_000) } },
    select: { key: true, metadata: true },
  });
  return rows.map((r) => {
    const md = (r.metadata ?? {}) as { sport?: string; matches?: UnmappedMatch[] };
    return { league: r.key, sport: md.sport ?? "?", matches: md.matches ?? [] };
  });
}
