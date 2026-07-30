// TheSportsMatchCache.lineup 의 선수 position(G/D/M/F) → TheSportsPlayer.position backfill.
// 라인업 캐시(축구)에서 player id → position 추출 후 position 그룹별 updateMany (pool 보호).
//   npx tsx --env-file=.env.local scripts/backfill-football-position.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface LineupPlayer { id?: string; position?: string; logo?: string }

function collectPlayers(lu: unknown, out: Map<string, string>) {
  const root = lu as Record<string, unknown> | null;
  if (!root) return;
  const lineup = (root.lineup ?? root) as Record<string, unknown>;
  for (const sideKey of ["home", "away"]) {
    const side = lineup?.[sideKey] as { players?: unknown; lineup?: unknown } | unknown[] | undefined;
    const players = (Array.isArray(side) ? side : (side?.players ?? side?.lineup ?? [])) as LineupPlayer[];
    if (!Array.isArray(players)) continue;
    for (const p of players) {
      if (p?.id && p?.position && ["G", "D", "M", "F"].includes(p.position)) {
        out.set(p.id, p.position); // 최근 캐시가 마지막에 덮음
      }
    }
  }
}

async function main() {
  const caches = await prisma.theSportsMatchCache.findMany({
    select: { lineup: true },
    orderBy: { updatedAt: "asc" }, // 오래된 것 먼저 → 최신이 덮어쓰게
  });
  console.log("캐시 매치:", caches.length);

  const posMap = new Map<string, string>();
  for (const c of caches) if (c.lineup) collectPlayers(c.lineup, posMap);
  console.log("추출된 선수→포지션:", posMap.size);

  // position 그룹별로 묶어 updateMany (4콜)
  const groups: Record<string, string[]> = { G: [], D: [], M: [], F: [] };
  for (const [id, pos] of posMap) groups[pos].push(id);
  for (const [pos, ids] of Object.entries(groups)) {
    console.log(`  ${pos}: ${ids.length}명`);
  }

  let updated = 0;
  for (const [pos, ids] of Object.entries(groups)) {
    // 65k 파라미터 한도 회피 — 5000개씩 분할
    for (let i = 0; i < ids.length; i += 5000) {
      const chunk = ids.slice(i, i + 5000);
      const r = await prisma.theSportsPlayer.updateMany({
        where: { id: { in: chunk }, sport: "FOOTBALL" },
        data: { position: pos },
      });
      updated += r.count;
    }
    console.log(`  ${pos} 적용 누적: ${updated}`);
  }
  console.log("position 적용된 TheSportsPlayer:", updated);

  // 검증: 몸값 선수 중 position 채워진 비율
  const mvIds = (await prisma.playerMarketValue.findMany({
    where: { league: { not: null } },
    select: { id: true },
  })).map((r) => r.id);
  const withPos = await prisma.theSportsPlayer.count({
    where: { id: { in: mvIds }, position: { not: null } },
  });
  console.log(`5대리그 몸값선수 ${mvIds.length}명 중 position 보유: ${withPos}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
