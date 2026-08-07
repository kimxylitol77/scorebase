// 선수 수상 경력 수집 — af /trophies → PlayerTrophy (Winner·2nd Place 만).
// af 매핑 선수 전체를 syncedAt 오래된 순으로 회당 limit 명씩 순환 (daily cron ≈ 2주 주기).
// backfill=true 는 전체 1회 처리 (로컬 수동 실행용). cron: /api/cron/player-trophies.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { tsAfEntries } from "@/lib/players/ts-af-map";
import { fetchPlayerTrophies } from "@/lib/sports/api-football-pro";

const KEEP_PLACES = new Set(["Winner", "2nd Place"]);

// 레이트리밋 — af Ultra 분당 ~450. 150ms 간격 스로틀 (collect-player-match-logs 와 동일).
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 150;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function runCollectPlayerTrophies({ backfill = false, limit = 250 }: { backfill?: boolean; limit?: number } = {}) {
  const all = tsAfEntries(); // [tsId, afId][]
  let targets: [string, number][];
  if (backfill) {
    targets = all;
  } else {
    // syncedAt 오래된(또는 미동기) 순 — 커서 없이도 전 선수를 공평하게 순환
    const synced = await prisma.playerTrophySync.findMany({ select: { playerId: true, syncedAt: true } });
    const syncedAt = new Map(synced.map((s) => [s.playerId, s.syncedAt.getTime()]));
    targets = [...all].sort((a, b) => (syncedAt.get(a[0]) ?? 0) - (syncedAt.get(b[0]) ?? 0)).slice(0, limit);
  }

  // af 호출은 스로틀 순차, DB 적재는 모아서 벌크 — Neon 왕복 최소화
  let players = 0;
  const trophyData: { id: string; playerId: string; league: string; country: string | null; season: string; place: string }[] = [];
  const syncedIds: string[] = [];
  for (const [tsId, afId] of targets) {
    await throttle();
    const trophies = await fetchPlayerTrophies(afId);
    for (const t of trophies) {
      if (!KEEP_PLACES.has(t.place)) continue;
      trophyData.push({
        id: `${tsId}:${t.league}:${t.season}:${t.place}`,
        playerId: tsId,
        league: t.league,
        country: t.country,
        season: t.season,
        place: t.place,
      });
    }
    syncedIds.push(tsId);
    players++;
  }
  // 같은 (대회,시즌,순위) 재수집은 skipDuplicates 로 멱등. id 중복(동명 대회 중복 응답)도 메모리 dedup.
  const byId = new Map(trophyData.map((d) => [d.id, d]));
  const unique = [...byId.values()];
  let rows = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const r = await prisma.playerTrophy.createMany({ data: unique.slice(i, i + 1000), skipDuplicates: true });
    rows += r.count;
  }
  const now = new Date();
  for (let i = 0; i < syncedIds.length; i += 1000) {
    const chunk = syncedIds.slice(i, i + 1000);
    await prisma.playerTrophySync.deleteMany({ where: { playerId: { in: chunk } } });
    await prisma.playerTrophySync.createMany({ data: chunk.map((playerId) => ({ playerId, syncedAt: now })) });
  }
  return { players, rows };
}
